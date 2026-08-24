/**
 * Shared orchestration types: the research plan, trace events, and the result
 * envelope. These are the contract between the reasoning layer (deterministic
 * or WebLLM), the orchestrator, and the UI.
 */

import type { z } from "zod";
import type { WorkflowState } from "@/core/orchestrator/states";
import type { AuditEntry } from "@/core/audit/log";
import type { ExperimentRecord, Critique } from "@/core/schemas/experiment";
import type { FeatureConfigSchema, WindowConfigSchema, StrategyConfigSchema, CostConfigSchema } from "@/core/schemas/configs";
import type { ModelType } from "@/core/ml/models";

export type AgentId =
  | "orchestrator"
  | "data-agent"
  | "research-agent"
  | "ml-agent"
  | "quant-agent"
  | "critic-agent"
  | "reporter-agent"
  | "coding-agent";

export interface ResearchPlan {
  datasetId: string;
  version: string;
  hypothesis: string;
  featureConfig: z.infer<typeof FeatureConfigSchema>;
  windowConfig: z.infer<typeof WindowConfigSchema>;
  models: ModelType[];
  includeCosts: boolean;
  strategyConfig: z.infer<typeof StrategyConfigSchema>;
  costConfig: z.infer<typeof CostConfigSchema>;
  /** Human-readable planning notes surfaced in the trace. */
  notes: string[];
}

export type TraceEventKind =
  | "state"
  | "agent"
  | "tool"
  | "reasoning"
  | "warning"
  | "error";

export interface TraceEvent {
  seq: number;
  at: number;
  kind: TraceEventKind;
  agentId: AgentId;
  state: WorkflowState;
  title: string;
  detail?: string;
  /** For tool events: the tool name, input hash and a compact output summary. */
  tool?: {
    name: string;
    ok: boolean;
    inputHash: string;
    outputHash?: string;
    durationMs: number;
    /** Structured payloads for the expandable UI event. */
    input?: unknown;
    output?: unknown;
    error?: string;
  };
}

export interface OrchestrationResult {
  sessionId: string;
  question: string;
  finalState: WorkflowState;
  plan: ResearchPlan;
  trace: TraceEvent[];
  audit: AuditEntry[];
  record: ExperimentRecord;
  critique: Critique;
  reportMarkdown: string;
  warnings: string[];
  /** Equity curves per model for the UI, keyed by modelId. */
  equityCurves: Record<string, Array<{ t: number; equity: number; drawdown: number }>>;
  seed: number;
  reasoner: "deterministic" | "webllm";
  startedAt: number;
  finishedAt: number;
}
