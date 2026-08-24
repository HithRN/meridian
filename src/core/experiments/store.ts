/**
 * Experiment store.
 *
 * Per §5/§12 the deployed demo must not depend on a paid database or a
 * long-running MLflow server. The store is therefore a small, portable
 * abstraction with two concrete backings:
 *   - `InMemoryExperimentStore` — used by serverless route handlers (ephemeral,
 *     seeded with canonical examples so GET always returns content),
 *   - the client persists its own runs in the browser (see `src/store`).
 *
 * An MLflow-style export/import is provided so records are portable to a real
 * tracking server during local development.
 */

import { ExperimentRecordSchema, type ExperimentRecord } from "@/core/schemas/experiment";
import { experimentTitle } from "@/lib/labels";

export interface ExperimentSummary {
  id: string;
  /** Plain-English title derived from the plan. */
  title: string;
  createdAt: number;
  question: string;
  status: ExperimentRecord["status"];
  datasetId: string;
  bestModelType: string;
  bestAuc: number;
  bestSharpe: number | null;
  modelCount: number;
  critiqueSeverity: string;
}

export interface ExperimentStore {
  list(): ExperimentSummary[];
  get(id: string): ExperimentRecord | undefined;
  put(record: ExperimentRecord): ExperimentRecord;
  remove(id: string): boolean;
}

export function summarise(r: ExperimentRecord): ExperimentSummary {
  const best = r.models.find((m) => m.modelId === r.bestModelId) ?? r.models[0];
  return {
    id: r.id,
    title: experimentTitle(r),
    createdAt: r.createdAt,
    question: r.question,
    status: r.status,
    datasetId: r.dataset.datasetId,
    bestModelType: best?.modelType ?? "—",
    bestAuc: best?.metrics.auc ?? 0,
    bestSharpe: best?.backtest?.sharpe ?? null,
    modelCount: r.models.length,
    critiqueSeverity: r.critique?.severity ?? "none",
  };
}

export class InMemoryExperimentStore implements ExperimentStore {
  private readonly records = new Map<string, ExperimentRecord>();

  constructor(seed: ExperimentRecord[] = []) {
    for (const r of seed) this.records.set(r.id, r);
  }

  list(): ExperimentSummary[] {
    return [...this.records.values()]
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(summarise);
  }

  get(id: string): ExperimentRecord | undefined {
    return this.records.get(id);
  }

  put(record: ExperimentRecord): ExperimentRecord {
    const validated = ExperimentRecordSchema.parse(record);
    this.records.set(validated.id, validated);
    return validated;
  }

  remove(id: string): boolean {
    return this.records.delete(id);
  }
}

/** MLflow-portable export: a versioned envelope of records. */
export interface ExperimentExport {
  format: "meridian-experiments";
  exportedAt: number;
  count: number;
  records: ExperimentRecord[];
}

export function exportExperiments(records: ExperimentRecord[]): ExperimentExport {
  return {
    format: "meridian-experiments",
    exportedAt: Date.now(),
    count: records.length,
    records,
  };
}

export function importExperiments(data: unknown): ExperimentRecord[] {
  const env = data as Partial<ExperimentExport>;
  if (!env || env.format !== "meridian-experiments" || !Array.isArray(env.records)) {
    throw new Error("Unrecognised experiment export format.");
  }
  return env.records.map((r) => ExperimentRecordSchema.parse(r));
}
