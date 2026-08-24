/**
 * Tool registry — the single execution path for every tool call.
 *
 * Responsibilities:
 *   1. Discovery: expose stable names + JSON Schemas (MCP-compatible).
 *   2. Validation: reject unknown/invalid inputs *before* the handler runs, and
 *      validate the handler's output *before* it leaves the boundary.
 *   3. Audit: record agent id, input hash, output summary, timing and status.
 *
 * A handler therefore cannot receive malformed input or emit a malformed result
 * — the type system and the runtime schema agree.
 */

import { z } from "zod";
import type {
  ToolDefinition,
  ToolContext,
  ToolManifestEntry,
  ToolCallResult,
} from "@/core/tools/types";
import { hashValue, shortHash } from "@/core/hash";
import { nextAuditId } from "@/core/audit/log";
import { versionManifest } from "@/core/version";

const registry = new Map<string, ToolDefinition>();

export function registerTool<I extends z.ZodType, O extends z.ZodType>(
  def: ToolDefinition<I, O>,
): void {
  // Registration is idempotent: the catalog is defined once, but a module may
  // be re-evaluated (HMR in dev, or duplicate evaluation across runtime
  // contexts). Overwriting with the latest definition is safe because tools are
  // pure and keyed by a stable name — and it avoids spurious "duplicate" errors.
  // The registry is intentionally type-erased; validation happens at call time
  // via the stored Zod schemas.
  registry.set(def.name, def as unknown as ToolDefinition);
}

export function getTool(name: string): ToolDefinition | undefined {
  return registry.get(name);
}

export function listTools(): ToolDefinition[] {
  return [...registry.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** MCP-style discovery manifest with JSON Schemas for every tool. */
export function getToolManifest(): ToolManifestEntry[] {
  return listTools().map((t) => ({
    name: t.name,
    title: t.title,
    description: t.description,
    permission: t.permission,
    deterministic: t.deterministic,
    inputSchema: safeJsonSchema(t.input),
    outputSchema: safeJsonSchema(t.output),
  }));
}

function safeJsonSchema(schema: z.ZodType): unknown {
  try {
    return z.toJSONSchema(schema, { target: "draft-7" });
  } catch {
    return { type: "object", description: "schema unavailable" };
  }
}

export class ToolNotFoundError extends Error {
  constructor(name: string) {
    super(`Unknown tool: ${name}`);
    this.name = "ToolNotFoundError";
  }
}

/**
 * Execute a tool by name. Never throws for validation/handler errors — returns
 * a structured `ToolCallResult` so agents can branch on `ok` and the audit
 * trail always captures the attempt.
 */
export async function executeTool<T = unknown>(
  name: string,
  rawInput: unknown,
  ctx: ToolContext,
): Promise<ToolCallResult<T>> {
  const started = Date.now();
  const tool = registry.get(name);
  const versions = versionManifest() as unknown as Record<string, string>;

  if (!tool) {
    return {
      ok: false,
      tool: name,
      error: { code: "TOOL_NOT_FOUND", message: `Unknown tool: ${name}` },
      meta: {
        agentId: ctx.agentId,
        inputHash: shortHash(rawInput),
        durationMs: Date.now() - started,
        versions,
      },
    };
  }

  const inputHash = shortHash(rawInput);
  const parsed = tool.input.safeParse(rawInput);
  if (!parsed.success) {
    const result: ToolCallResult<T> = {
      ok: false,
      tool: name,
      error: {
        code: "INVALID_INPUT",
        message: "Input failed schema validation.",
        issues: parsed.error.issues,
      },
      meta: {
        agentId: ctx.agentId,
        inputHash,
        durationMs: Date.now() - started,
        versions,
      },
    };
    ctx.audit.record({
      id: nextAuditId(),
      timestamp: started,
      agentId: ctx.agentId,
      tool: name,
      permission: tool.permission,
      inputHash,
      input: rawInput,
      status: "error",
      errorCode: "INVALID_INPUT",
      durationMs: Date.now() - started,
    });
    return result;
  }

  try {
    const output = await tool.handler(parsed.data, ctx);
    const validated = tool.output.safeParse(output);
    if (!validated.success) {
      // A handler produced a shape that violates its own contract — a bug we
      // surface loudly rather than leak downstream.
      throw new OutputContractError(name, validated.error.issues);
    }
    const outputHash = shortHash(validated.data);
    ctx.audit.record({
      id: nextAuditId(),
      timestamp: started,
      agentId: ctx.agentId,
      tool: name,
      permission: tool.permission,
      inputHash,
      input: parsed.data,
      outputHash,
      outputSummary: summarise(validated.data),
      status: "ok",
      durationMs: Date.now() - started,
    });
    return {
      ok: true,
      tool: name,
      data: validated.data as T,
      meta: {
        agentId: ctx.agentId,
        inputHash,
        outputHash,
        durationMs: Date.now() - started,
        versions,
      },
    };
  } catch (err) {
    const code = err instanceof OutputContractError ? "OUTPUT_CONTRACT" : "HANDLER_ERROR";
    const message = err instanceof Error ? err.message : String(err);
    ctx.audit.record({
      id: nextAuditId(),
      timestamp: started,
      agentId: ctx.agentId,
      tool: name,
      permission: tool.permission,
      inputHash,
      input: parsed.data,
      status: "error",
      errorCode: code,
      durationMs: Date.now() - started,
    });
    return {
      ok: false,
      tool: name,
      error: { code, message },
      meta: {
        agentId: ctx.agentId,
        inputHash,
        durationMs: Date.now() - started,
        versions,
      },
    };
  }
}

/** Very small, safe output summary for the audit log. */
function summarise(data: unknown): string {
  const s = JSON.stringify(data, (_k, v) =>
    Array.isArray(v) && v.length > 8 ? `[${v.length} items]` : v,
  );
  const full = s ?? "";
  const hash = hashValue(data).slice(0, 6);
  return full.length > 240 ? `${full.slice(0, 240)}… (#${hash})` : full;
}

class OutputContractError extends Error {
  constructor(tool: string, public issues: unknown) {
    super(`Tool "${tool}" produced output that violates its schema.`);
    this.name = "OutputContractError";
  }
}
