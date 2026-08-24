/**
 * The orchestrator.
 *
 * Drives a research session through the workflow state machine (§9), delegating
 * to specialised agents that call deterministic tools through the audited
 * registry. It:
 *   - asks the reasoner to interpret the question into a validated plan,
 *   - validates the data (and refuses to proceed on critical leakage),
 *   - runs the feature/split/train/evaluate/backtest pipeline per model,
 *   - invokes the critic to falsify the result,
 *   - has the reporter assemble an evidence report,
 *   - finalises a reproducible experiment record.
 *
 * Every step appends to a replayable trace and an audit log. No metric is ever
 * produced outside a tool call.
 */

import { executeTool, type ToolContext, PUBLIC_LIMITS } from "@/core/tools";
import { InMemoryAuditSink } from "@/core/audit/log";
import {
  WORKFLOW_STATES,
  type WorkflowState,
  canTransition,
} from "@/core/orchestrator/states";
import type {
  AgentId,
  OrchestrationResult,
  ResearchPlan,
  TraceEvent,
} from "@/core/orchestrator/types";
import type { Reasoner } from "@/core/llm/types";
import { critique, type CriticInput } from "@/core/orchestrator/critic";
import { buildReport } from "@/core/orchestrator/reporter";
import { listDatasets, getDataset } from "@/core/data/dataset";
import type { ModelResult } from "@/core/schemas/experiment";
import { ExperimentRecordSchema } from "@/core/schemas/experiment";
import { versionManifest } from "@/core/version";
import { hashValue } from "@/core/hash";
import type { ClassificationMetrics } from "@/core/ml/metrics";
import type { DatasetProfile } from "@/core/data/profile";

export interface RunOptions {
  question: string;
  seed?: number;
  reasoner: Reasoner;
  /** Optional cap on models to bound compute for public requests. */
  maxModels?: number;
  /** Streaming hook: receives each trace event as it is emitted (for live UI). */
  onEvent?: (event: TraceEvent) => void;
}

interface Emitter {
  (event: Omit<TraceEvent, "seq" | "at">): void;
}

export async function runResearch(opts: RunOptions): Promise<OrchestrationResult> {
  const startedAt = Date.now();
  const seed = opts.seed ?? 42;
  const sessionId = `sess_${hashValue({ q: opts.question, seed, r: opts.reasoner.id }).slice(0, 10)}`;
  const audit = new InMemoryAuditSink();
  const trace: TraceEvent[] = [];
  let seq = 0;
  let state: WorkflowState = "RECEIVED";
  const warnings: string[] = [];

  const emit: Emitter = (event) => {
    const full: TraceEvent = { ...event, seq: seq++, at: Date.now() };
    trace.push(full);
    opts.onEvent?.(full);
  };

  const ctxFor = (agentId: AgentId): ToolContext => ({
    seed,
    limits: PUBLIC_LIMITS,
    agentId,
    audit,
  });

  const transition = (to: WorkflowState, agentId: AgentId, title: string) => {
    if (!canTransition(state, to)) {
      throw new Error(`Illegal transition ${state} → ${to}`);
    }
    state = to;
    emit({ kind: "state", agentId, state, title });
  };

  const call = async <T>(agentId: AgentId, tool: string, input: unknown): Promise<T> => {
    const res = await executeTool<T>(tool, input, ctxFor(agentId));
    emit({
      kind: "tool",
      agentId,
      state,
      title: `${tool} ${res.ok ? "ok" : "error"}`,
      tool: {
        name: tool,
        ok: res.ok,
        inputHash: res.meta.inputHash,
        outputHash: res.meta.outputHash,
        durationMs: res.meta.durationMs,
        input,
        output: res.ok ? res.data : undefined,
        error: res.ok ? undefined : res.error?.message,
      },
    });
    if (!res.ok) {
      throw new ToolFailure(tool, res.error?.message ?? "unknown error");
    }
    return res.data as T;
  };

  const reason = async (agentId: AgentId, plan: ResearchPlan, facts: Record<string, string | number | boolean> = {}) => {
    const text = await opts.reasoner.narrate({ agentId, plan, facts });
    emit({ kind: "reasoning", agentId, state, title: `${agentId} reasoning`, detail: text });
  };

  // ---- RECEIVED → PLAN_CREATED -----------------------------------------
  emit({ kind: "state", agentId: "orchestrator", state, title: "Session received" });
  const datasets = listDatasets(false);
  const plan = await opts.reasoner.interpret(opts.question, datasets);
  if (opts.maxModels) plan.models = plan.models.slice(0, opts.maxModels);
  transition("PLAN_CREATED", "orchestrator", "Plan created");
  for (const note of plan.notes) {
    emit({ kind: "reasoning", agentId: "orchestrator", state, title: "Plan note", detail: note });
  }

  // ---- PLAN_CREATED → DATA_VALIDATED -----------------------------------
  await reason("data-agent", plan);
  const profile = await call<DatasetProfile>("data-agent", "profile_dataset", {
    datasetId: plan.datasetId,
    version: plan.version,
  });
  const leakageCritical = profile.leakage.filter((l) => l.severity === "critical").length;
  for (const w of profile.warnings) {
    warnings.push(w);
    emit({ kind: "warning", agentId: "data-agent", state, title: "Data warning", detail: w });
  }
  if (leakageCritical > 0) {
    // Guardrail: refuse to model on a leaking dataset.
    emit({
      kind: "error",
      agentId: "data-agent",
      state,
      title: "Critical leakage — modelling halted",
      detail: `${leakageCritical} feature(s) encode future information.`,
    });
    throw new LeakageHalt(leakageCritical);
  }
  transition("DATA_VALIDATED", "data-agent", "Data validated");

  // ---- DATA_VALIDATED → HYPOTHESIS_DEFINED -----------------------------
  await reason("research-agent", plan);
  transition("HYPOTHESIS_DEFINED", "research-agent", "Hypothesis defined");

  // ---- HYPOTHESIS_DEFINED → FEATURES_READY -----------------------------
  await call("research-agent", "create_features", {
    datasetId: plan.datasetId,
    version: plan.version,
    featureConfig: plan.featureConfig,
  });
  await call("research-agent", "walk_forward_split", {
    datasetId: plan.datasetId,
    version: plan.version,
    featureConfig: plan.featureConfig,
    windowConfig: plan.windowConfig,
  });
  transition("FEATURES_READY", "research-agent", "Features & splits ready");

  // ---- FEATURES_READY → EXPERIMENTS_RUNNING ----------------------------
  transition("EXPERIMENTS_RUNNING", "ml-agent", "Experiments running");
  const results: ModelResult[] = [];
  const equityCurves: OrchestrationResult["equityCurves"] = {};
  const foldAucsByModel: Record<string, number[]> = {};
  const grossSharpeByModel: Record<string, number> = {};

  for (const modelType of plan.models) {
    await reason("ml-agent", plan, { model: modelType });
    const modelConfig = { type: modelType, seed };
    const base = {
      datasetId: plan.datasetId,
      version: plan.version,
      featureConfig: plan.featureConfig,
      windowConfig: plan.windowConfig,
      modelConfig,
    };

    const trained = await call<{ modelId: string; hyperparameters: Record<string, number | string> }>(
      "ml-agent",
      "train_model",
      base,
    );
    const evaluated = await call<{
      aggregate: ClassificationMetrics;
      folds: Array<{ metrics: ClassificationMetrics }>;
      oosCount: number;
    }>("ml-agent", "evaluate_model", base);

    await reason("quant-agent", plan, { model: modelType });
    const bt = await call<{
      summary: ModelResult["backtest"] & object;
      equityCurve: Array<{ t: number; equity: number; drawdown: number }>;
    }>("quant-agent", "backtest", {
      ...base,
      strategyConfig: plan.strategyConfig,
      costConfig: plan.costConfig,
    });

    // A gross (cost-free) backtest so the critic can measure cost drag.
    const btGross = await call<{ summary: { sharpe: number } }>("quant-agent", "backtest", {
      ...base,
      strategyConfig: plan.strategyConfig,
      costConfig: { costBps: 0, slippageBps: 0 },
    });

    foldAucsByModel[trained.modelId] = evaluated.folds.map((f) => f.metrics.auc);
    grossSharpeByModel[trained.modelId] = btGross.summary.sharpe;
    equityCurves[trained.modelId] = bt.equityCurve.map((p) => ({ t: p.t, equity: p.equity, drawdown: p.drawdown }));

    results.push({
      modelId: trained.modelId,
      modelType,
      hyperparameters: trained.hyperparameters,
      metrics: evaluated.aggregate,
      backtest: bt.summary,
    });
  }
  transition("RESULTS_READY", "ml-agent", "Results ready");

  // ---- RESULTS_READY → CRITIQUE ----------------------------------------
  await reason("critic-agent", plan);
  // Select the best model by out-of-sample AUC (ties broken by Sharpe).
  const best = [...results].sort(
    (a, b) => b.metrics.auc - a.metrics.auc || (b.backtest?.sharpe ?? 0) - (a.backtest?.sharpe ?? 0),
  )[0];
  const baseline = results.find((r) => r.modelType === "majority") ?? results[0];

  const criticInput: CriticInput = {
    plan,
    oosCount: best.metrics.n,
    leakageCritical,
    best: {
      modelType: best.modelType,
      metrics: best.metrics,
      sharpeGross: grossSharpeByModel[best.modelId] ?? best.backtest?.sharpe ?? 0,
      sharpeNet: best.backtest?.sharpe ?? 0,
      maxDrawdown: best.backtest?.maxDrawdown ?? 0,
      exposure: best.backtest?.exposure ?? 0,
      benchmarkReturn: best.backtest?.benchmarkReturn ?? 0,
      totalReturnNet: best.backtest?.totalReturn ?? 0,
    },
    baseline: { metrics: baseline.metrics },
    foldAucs: foldAucsByModel[best.modelId] ?? [],
  };
  const critiqueResult = critique(criticInput);
  for (const f of critiqueResult.findings) {
    emit({
      kind: "warning",
      agentId: "critic-agent",
      state,
      title: `Critique: ${f.code}`,
      detail: `[${f.severity}] ${f.message}`,
    });
  }
  transition("CRITIQUE", "critic-agent", "Critique complete");

  // ---- CRITIQUE → REPORT_READY -----------------------------------------
  await reason("reporter-agent", plan);
  const ds = getDataset(plan.datasetId, plan.version);

  const recordDraft = {
    question: opts.question,
    status: (critiqueResult.passed ? "evaluated" : "candidate") as "evaluated" | "candidate",
    dataset: {
      datasetId: ds.id,
      version: ds.version,
      contentHash: ds.contentHash,
      rows: ds.bars.length,
    },
    seed,
    featureConfig: plan.featureConfig,
    windowConfig: plan.windowConfig,
    strategyConfig: plan.strategyConfig,
    costConfig: plan.costConfig,
    models: results,
    bestModelId: best.modelId,
    baselineModelId: baseline.modelId,
    critique: critiqueResult,
    warnings,
    toolCalls: audit.entries().length,
  };

  const finalized = await call<{ experimentId: string; record: unknown }>(
    "reporter-agent",
    "record_experiment",
    recordDraft,
  );
  // Stamp wall-clock time and revalidate.
  const record = ExperimentRecordSchema.parse({
    ...(finalized.record as object),
    createdAt: Date.now(),
    versions: versionManifest(),
  });

  const reportMarkdown = buildReport(opts.question, plan, record, profile);
  transition("REPORT_READY", "reporter-agent", "Report ready");

  return {
    sessionId,
    question: opts.question,
    finalState: state,
    plan,
    trace,
    audit: audit.entries(),
    record,
    critique: critiqueResult,
    reportMarkdown,
    warnings,
    equityCurves,
    seed,
    reasoner: opts.reasoner.id,
    startedAt,
    finishedAt: Date.now(),
  };
}

export class ToolFailure extends Error {
  constructor(tool: string, message: string) {
    super(`Tool "${tool}" failed: ${message}`);
    this.name = "ToolFailure";
  }
}

export class LeakageHalt extends Error {
  constructor(count: number) {
    super(`Modelling halted: ${count} critical leakage finding(s).`);
    this.name = "LeakageHalt";
  }
}

/** Convenience: the ordered list of workflow states for UI stepper rendering. */
export const ALL_STATES = WORKFLOW_STATES;
