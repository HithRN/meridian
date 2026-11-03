/**
 * Model Context Protocol server (stateless Streamable HTTP, JSON responses).
 *
 * Implements the MCP lifecycle and tools capability over JSON-RPC 2.0:
 *   initialize · notifications/initialized · ping · tools/list · tools/call
 * Each HTTP POST carries one JSON-RPC message; responses are returned as
 * application/json (no server-initiated stream), which the Streamable HTTP
 * transport permits. The server keeps no session state, so it runs unchanged
 * on serverless instances.
 *
 * Tools are the audited registry tools plus `run_quant_research`. Every call
 * goes through the same schema validation and audit path as the agents use,
 * and every tool is read-only: nothing can trade, sign or write.
 */

import { getToolManifest } from "@/core/tools";
import { InMemoryAuditSink } from "@/core/audit/log";
import { copilotToolSpecs, runCopilotTool } from "@/core/copilot/tools";
import { executeTool, PUBLIC_LIMITS } from "@/core/tools";
import { PLATFORM_VERSION } from "@/core/version";

export const SUPPORTED_PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26"] as const;
export const LATEST_PROTOCOL_VERSION = SUPPORTED_PROTOCOL_VERSIONS[0];

type JsonRpcId = string | number;

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: JsonRpcId | null;
  method: string;
  params?: Record<string, unknown>;
}

export type JsonRpcResponse =
  | { jsonrpc: "2.0"; id: JsonRpcId | null; result: unknown }
  | { jsonrpc: "2.0"; id: JsonRpcId | null; error: { code: number; message: string; data?: unknown } };

export const RPC = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
} as const;

interface McpTool {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  annotations: { readOnlyHint: boolean; destructiveHint: boolean; idempotentHint: boolean; openWorldHint: boolean };
}

function stripSchema(schema: unknown): Record<string, unknown> {
  const s = { ...(schema as Record<string, unknown>) };
  delete s.$schema;
  return { ...s, type: "object" };
}

let toolCache: McpTool[] | null = null;

export function mcpTools(): McpTool[] {
  if (toolCache) return toolCache;
  const registry: McpTool[] = getToolManifest().map((t) => ({
    name: t.name,
    title: t.title,
    description: t.description,
    inputSchema: stripSchema(t.inputSchema),
    outputSchema: (t.outputSchema as { type?: string })?.type === "object" ? stripSchema(t.outputSchema) : undefined,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: t.deterministic,
      openWorldHint: t.permission === "network-read",
    },
  }));
  const research = copilotToolSpecs().find((t) => t.name === "run_quant_research")!;
  registry.push({
    name: research.name,
    title: "Run quant research",
    description: research.description,
    inputSchema: research.input_schema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  });
  toolCache = registry;
  return registry;
}

const ok = (id: JsonRpcId | null, result: unknown): JsonRpcResponse => ({ jsonrpc: "2.0", id, result });
const fail = (id: JsonRpcId | null, code: number, message: string, data?: unknown): JsonRpcResponse => ({
  jsonrpc: "2.0",
  id,
  error: { code, message, ...(data === undefined ? {} : { data }) },
});

/** Validate the envelope of one JSON-RPC message. */
export function parseMessage(raw: unknown): JsonRpcRequest | JsonRpcResponse {
  if (Array.isArray(raw)) return fail(null, RPC.INVALID_REQUEST, "JSON-RPC batching is not supported by this protocol version.");
  const m = raw as Partial<JsonRpcRequest> | null;
  if (!m || typeof m !== "object" || m.jsonrpc !== "2.0" || typeof m.method !== "string") {
    return fail((m?.id as JsonRpcId) ?? null, RPC.INVALID_REQUEST, "Expected a JSON-RPC 2.0 request object.");
  }
  return m as JsonRpcRequest;
}

/** Handle one request. Returns null for notifications (no response body). */
export async function handleMcp(req: JsonRpcRequest): Promise<JsonRpcResponse | null> {
  const isNotification = req.id === undefined;
  const id = (req.id ?? null) as JsonRpcId | null;

  switch (req.method) {
    case "initialize": {
      const requested = String(req.params?.protocolVersion ?? "");
      const protocolVersion = (SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(requested)
        ? requested
        : LATEST_PROTOCOL_VERSION;
      return ok(id, {
        protocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "meridian", title: "Meridian research tools", version: PLATFORM_VERSION },
        instructions:
          "Read-only quantitative research and Solana/Jito analytics tools. Every number is computed deterministically and audited; " +
          "network tools report whether data is live or a bundled snapshot. Research datasets are synthetic.",
      });
    }
    case "notifications/initialized":
    case "notifications/cancelled":
      return null;
    case "ping":
      return ok(id, {});
    case "tools/list":
      return ok(id, { tools: mcpTools() });
    case "tools/call": {
      const name = req.params?.name;
      const args = (req.params?.arguments ?? {}) as Record<string, unknown>;
      if (typeof name !== "string" || !mcpTools().some((t) => t.name === name)) {
        return fail(id, RPC.INVALID_PARAMS, `Unknown tool: ${String(name)}`);
      }
      const audit = new InMemoryAuditSink();
      if (name === "run_quant_research") {
        const r = await runCopilotTool(name, args, audit);
        return ok(id, toolResult(r.ok, r.ok ? r.output : { error: r.error }));
      }
      const res = await executeTool(name, args, { seed: 42, limits: PUBLIC_LIMITS, agentId: "mcp-client", audit });
      const tool = mcpTools().find((t) => t.name === name)!;
      return ok(
        id,
        toolResult(res.ok, res.ok ? res.data : { error: res.error }, Boolean(tool.outputSchema) && res.ok, {
          inputHash: res.meta.inputHash,
          outputHash: res.meta.outputHash,
          durationMs: res.meta.durationMs,
        }),
      );
    }
    default:
      if (isNotification) return null;
      return fail(id, RPC.METHOD_NOT_FOUND, `Method not found: ${req.method}`);
  }
}

function toolResult(success: boolean, payload: unknown, structured = success, meta?: Record<string, unknown>) {
  return {
    content: [{ type: "text", text: JSON.stringify(payload) }],
    ...(structured ? { structuredContent: payload } : {}),
    isError: !success,
    ...(meta ? { _meta: { "meridian/audit": meta } } : {}),
  };
}
