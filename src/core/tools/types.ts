/**
 * Tool contracts.
 *
 * Every capability the agents can invoke is a `ToolDefinition` with a strict
 * Zod input and output schema, a permission class, and a pure-ish handler. This
 * is the MCP-compatible boundary: tools are discovered by name, called with
 * structured JSON, and return structured JSON. The registry — not the caller —
 * validates inputs on the way in and outputs on the way out, so an agent (or an
 * LLM) can never smuggle an unsupported parameter through or fabricate a result
 * shape.
 */

import type { z } from "zod";
import type { AuditSink } from "@/core/audit/log";

/**
 * Permission classes gate which agents may call which tools and bound what a
 * tool is allowed to touch. The public coding tools are deliberately the most
 * restricted.
 */
export type ToolPermission =
  | "read-data" // inspect bundled data; no mutation
  | "experiment" // feature/train/evaluate; produces records
  | "backtest" // trading simulation
  | "monitoring" // drift / performance
  | "coding-readonly" // read a whitelisted repo area
  | "coding-restricted"; // propose patch / run sandboxed tests, never destructive

/** Execution limits enforced for public requests (denial-of-service guard). */
export interface ToolLimits {
  maxRows: number;
  maxModels: number;
  maxFolds: number;
  maxEpochs: number;
}

export const PUBLIC_LIMITS: ToolLimits = {
  maxRows: 6000,
  maxModels: 5,
  maxFolds: 8,
  maxEpochs: 800,
};

export interface ToolContext {
  /** Global seed for any stochastic-but-seeded computation. */
  seed: number;
  limits: ToolLimits;
  /** Identifier of the agent invoking the tool (for the audit trail). */
  agentId: string;
  audit: AuditSink;
}

export interface ToolDefinition<
  I extends z.ZodType = z.ZodType,
  O extends z.ZodType = z.ZodType,
> {
  name: string;
  title: string;
  description: string;
  permission: ToolPermission;
  input: I;
  output: O;
  /** Whether the tool is deterministic given (input, seed). Always true here. */
  deterministic: boolean;
  handler: (input: z.infer<I>, ctx: ToolContext) => z.infer<O> | Promise<z.infer<O>>;
}

/** Discovery-facing description of a tool (safe to serialise to the client). */
export interface ToolManifestEntry {
  name: string;
  title: string;
  description: string;
  permission: ToolPermission;
  deterministic: boolean;
  inputSchema: unknown; // JSON Schema
  outputSchema: unknown; // JSON Schema
}

export interface ToolCallResult<T = unknown> {
  ok: boolean;
  tool: string;
  data?: T;
  error?: { code: string; message: string; issues?: unknown };
  meta: {
    agentId: string;
    inputHash: string;
    outputHash?: string;
    durationMs: number;
    versions: Record<string, string>;
  };
}
