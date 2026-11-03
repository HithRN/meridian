/**
 * Model lifecycle — the single source of truth for a model's registry status.
 *
 *   candidate  training finished, evaluation not complete
 *   evaluated  evaluated, not selected (or the reference baseline)
 *   approved   selected model that passed every acceptance criterion
 *   rejected   selected model that failed at least one criterion
 *   archived   superseded or withdrawn
 *
 * Every page that shows a status derives it here, so counts, tables and the
 * "approved" list can never disagree.
 */

import type { ExperimentRecord, ModelResult } from "@/core/schemas/experiment";

export type ModelStatus = "candidate" | "evaluated" | "approved" | "rejected" | "archived";
export const MODEL_STATUSES: ModelStatus[] = ["candidate", "evaluated", "approved", "rejected", "archived"];

export const STATUS_MEANING: Record<ModelStatus, string> = {
  candidate: "Training completed; evaluation pending",
  evaluated: "Evaluation completed; not selected, or the reference baseline",
  approved: "Selected model that passed every acceptance criterion",
  rejected: "Selected model that failed at least one criterion",
  archived: "Superseded or withdrawn",
};

export interface Criterion {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
}

export const MIN_AUC_LIFT = 0.01;
export const MIN_OOS_PREDICTIONS = 500;

/** Acceptance criteria for a selected model, evaluated against its experiment. */
export function acceptanceCriteria(record: ExperimentRecord, model: ModelResult): Criterion[] {
  const baseline = record.models.find((m) => m.modelId === record.baselineModelId);
  const lift = baseline ? model.metrics.auc - baseline.metrics.auc : model.metrics.auc - 0.5;
  const bt = model.backtest;
  const sharpeLow = bt?.sharpeStdErr !== undefined ? bt.sharpe - 1.96 * bt.sharpeStdErr : undefined;
  const highObjection = record.critique?.findings.some((f) => f.severity === "high") ?? false;
  return [
    {
      id: "critic",
      label: "Critic raised no high-severity objection",
      passed: !highObjection,
      detail: highObjection ? "High-severity finding present" : "No high-severity finding",
    },
    {
      id: "auc-lift",
      label: `AUC beats the baseline by ≥ ${MIN_AUC_LIFT}`,
      passed: lift >= MIN_AUC_LIFT,
      detail: `Lift ${lift >= 0 ? "+" : ""}${lift.toFixed(3)}`,
    },
    {
      id: "sharpe",
      label: "Net Sharpe 95% CI lower bound above zero",
      passed: bt ? (sharpeLow ?? bt.sharpe) > 0 : false,
      detail: bt ? (sharpeLow !== undefined ? `Lower bound ${sharpeLow.toFixed(2)}` : `Sharpe ${bt.sharpe.toFixed(2)} (no CI recorded)`) : "No backtest",
    },
    {
      id: "sample",
      label: `At least ${MIN_OOS_PREDICTIONS} out-of-sample predictions`,
      passed: model.metrics.n >= MIN_OOS_PREDICTIONS,
      detail: `${model.metrics.n} predictions`,
    },
  ];
}

export function modelStatus(record: ExperimentRecord, model: ModelResult): ModelStatus {
  if (record.status === "archived") return "archived";
  if (!record.critique) return "candidate";
  if (model.modelId !== record.bestModelId) return "evaluated";
  return acceptanceCriteria(record, model).every((c) => c.passed) ? "approved" : "rejected";
}
