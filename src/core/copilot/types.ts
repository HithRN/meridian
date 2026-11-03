/**
 * Copilot contracts shared by the API route, both engines and the UI.
 *
 * The copilot is a conversational front door to the same audited tools the
 * research agents use. Whatever engine answers (Claude or the deterministic
 * router), every figure in a reply must come from a recorded tool call, and
 * those calls are returned alongside the reply so the UI can show the evidence.
 */

export type CopilotEngine = "claude" | "deterministic";

export interface CopilotTurn {
  role: "user" | "assistant";
  content: string;
}

export interface CopilotToolCall {
  name: string;
  input: unknown;
  ok: boolean;
  /** Compact JSON output (large arrays elided): what the model saw. */
  output?: unknown;
  error?: string;
  durationMs: number;
}

export interface CopilotResponse {
  reply: string;
  toolCalls: CopilotToolCall[];
  engine: CopilotEngine;
  model?: string;
  /** Non-fatal notice, e.g. Claude unavailable → deterministic fallback. */
  notice?: string;
}
