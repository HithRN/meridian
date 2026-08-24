/**
 * Reasoning-layer contract.
 *
 * A `Reasoner` turns a natural-language research question into a *structured*
 * `ResearchPlan` and produces human-readable narration for the trace. It is the
 * ONLY place model inference is allowed — and it is deliberately kept away from
 * anything numeric. A reasoner never computes a metric, a return, or a p-value;
 * those come exclusively from deterministic tools. This boundary is what lets
 * us swap a real browser LLM (WebLLM) for a rule engine without weakening any
 * guarantee: the plan is schema-validated either way.
 */

import type { ResearchPlan, AgentId } from "@/core/orchestrator/types";
import type { DatasetMeta } from "@/core/data/dataset";

export type ReasonerId = "deterministic" | "webllm";

export interface NarrationContext {
  agentId: AgentId;
  plan: ResearchPlan;
  /** Compact, already-computed facts the narration may reference (no invention). */
  facts: Record<string, string | number | boolean>;
}

export interface Reasoner {
  id: ReasonerId;
  /** Human label for the UI (e.g. "Deterministic policy" or a model name). */
  label: string;
  /** Interpret a question into a validated plan given the available datasets. */
  interpret(question: string, datasets: DatasetMeta[]): Promise<ResearchPlan>;
  /** Produce a short reasoning string for an agent step. Never numeric truth. */
  narrate(context: NarrationContext): Promise<string>;
  /** Whether the reasoner is ready to run (e.g. model loaded). */
  isReady(): boolean;
}
