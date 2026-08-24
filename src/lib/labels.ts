/**
 * Human-readable labels.
 *
 * Internal identifiers (model types, dataset ids, experiment hashes) are code-y
 * by necessity; everywhere they are shown to a person we translate them to
 * plain English through these helpers.
 */

import type { ExperimentRecord } from "@/core/schemas/experiment";

const MODEL_LABELS: Record<string, string> = {
  majority: "Baseline (majority class)",
  logistic: "Logistic regression",
  gbt: "Gradient-boosted trees",
};

export function modelLabel(type: string): string {
  return MODEL_LABELS[type] ?? type;
}

/** Short model label for tight columns. */
export function modelLabelShort(type: string): string {
  switch (type) {
    case "majority":
      return "Baseline";
    case "logistic":
      return "Logistic reg.";
    case "gbt":
      return "Boosted trees";
    default:
      return type;
  }
}

export function datasetLabel(id: string): string {
  if (id.includes("equity")) return "Synthetic Equity";
  if (id.includes("fx")) return "Synthetic FX";
  if (id.includes("leakage")) return "Leakage Trap";
  return id
    .replace(/^synthetic-/, "")
    .replace(/-hourly$/, "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * A plain-English title for an experiment, derived from its plan. Not required
 * to be unique — the date and question disambiguate in the list.
 */
export function experimentTitle(record: ExperimentRecord): string {
  const momentum = record.featureConfig.momentumPeriod;
  const dataset = datasetLabel(record.dataset.datasetId);
  const models = record.models.length;
  return `${momentum}-period momentum on ${dataset} · ${models} models`;
}
