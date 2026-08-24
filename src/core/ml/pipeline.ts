/**
 * The canonical training/evaluation pipeline.
 *
 * Composes the deterministic building blocks — features, walk-forward splits,
 * model training, out-of-sample prediction — into one reproducible unit keyed
 * entirely by its inputs. Because it is a pure function of
 * (dataset, featureConfig, windowConfig, modelConfig), every tool that needs
 * model results can reconstruct them from the recorded inputs alone. That is
 * what makes each tool call independently replayable from the audit trail with
 * no server-side model store.
 */

import { getDataset } from "@/core/data/dataset";
import {
  buildFeatures,
  type FeatureConfig,
  type FeatureSet,
} from "@/core/ml/features";
import { walkForwardSplit, type WindowConfig, type SplitPlan } from "@/core/ml/splits";
import {
  trainModel,
  type ModelConfig,
  type TrainedModel,
} from "@/core/ml/models";
import {
  classificationMetrics,
  type ClassificationMetrics,
  type Prediction,
} from "@/core/ml/metrics";
import { hashValue } from "@/core/hash";
import { KERNEL_VERSION } from "@/core/version";

export interface OosPrediction extends Prediction {
  t: number;
  barIndex: number;
  fold: number;
}

export interface FoldResult {
  fold: number;
  trainRows: number;
  testRows: number;
  metrics: ClassificationMetrics;
}

export interface PipelineResult {
  datasetId: string;
  version: string;
  featureSetId: string;
  splitId: string;
  modelId: string;
  modelType: ModelConfig["type"];
  hyperparameters: Record<string, number | string>;
  featureNames: string[];
  featureConfig: FeatureConfig;
  windowConfig: WindowConfig;
  modelConfig: ModelConfig;
  folds: FoldResult[];
  aggregate: ClassificationMetrics;
  oos: OosPrediction[];
  featureRows: number;
}

export interface PipelineInput {
  datasetId: string;
  version: string;
  featureConfig: FeatureConfig;
  windowConfig: WindowConfig;
  modelConfig: ModelConfig;
}

/** Stable id for a feature set — hash of the inputs that determine it. */
export function featureSetId(
  datasetId: string,
  version: string,
  cfg: FeatureConfig,
): string {
  return `fs_${hashValue({ datasetId, version, cfg, kernel: KERNEL_VERSION }).slice(0, 12)}`;
}

export function splitId(
  datasetId: string,
  version: string,
  cfg: FeatureConfig,
  win: WindowConfig,
): string {
  return `sp_${hashValue({ datasetId, version, cfg, win }).slice(0, 12)}`;
}

export function modelId(input: PipelineInput): string {
  return `mdl_${hashValue({ ...input, kernel: KERNEL_VERSION }).slice(0, 12)}`;
}

/**
 * Bounded memo cache. `runPipeline` is a pure function of its input, so caching
 * by a canonical content hash is safe and lets the orchestrator call
 * train/evaluate/backtest for the same model without recomputing the folds.
 * The cache is an optimisation only — determinism guarantees identical results
 * with or without it.
 */
const pipelineCache = new Map<string, PipelineResult>();
const PIPELINE_CACHE_MAX = 64;

export function runPipeline(input: PipelineInput): PipelineResult {
  const cacheKey = hashValue({ ...input, kernel: KERNEL_VERSION });
  const cached = pipelineCache.get(cacheKey);
  if (cached) return cached;

  const result = computePipeline(input);

  if (pipelineCache.size >= PIPELINE_CACHE_MAX) {
    // Evict the oldest entry (Map preserves insertion order).
    const oldest = pipelineCache.keys().next().value;
    if (oldest !== undefined) pipelineCache.delete(oldest);
  }
  pipelineCache.set(cacheKey, result);
  return result;
}

function computePipeline(input: PipelineInput): PipelineResult {
  const dataset = getDataset(input.datasetId, input.version);
  const fs: FeatureSet = buildFeatures(dataset.bars, input.featureConfig);
  const plan: SplitPlan = walkForwardSplit(fs.rows.length, input.windowConfig);

  const folds: FoldResult[] = [];
  const oos: OosPrediction[] = [];

  for (const w of plan.windows) {
    const trainRows = fs.rows.slice(w.trainStart, w.trainEnd);
    const testRows = fs.rows.slice(w.testStart, w.testEnd);
    if (trainRows.length < 10 || testRows.length < 1) continue;

    const X = trainRows.map((r) => r.features);
    const y = trainRows.map((r) => r.label);
    const model: TrainedModel = trainModel(X, y, input.modelConfig);

    const preds: Prediction[] = testRows.map((r) => {
      const proba = model.predictProba(r.features);
      return { proba, label: r.label, forwardReturn: r.forwardReturn };
    });
    folds.push({
      fold: w.fold,
      trainRows: trainRows.length,
      testRows: testRows.length,
      metrics: classificationMetrics(preds),
    });
    testRows.forEach((r, i) => {
      oos.push({
        proba: preds[i].proba,
        label: r.label,
        forwardReturn: r.forwardReturn,
        t: r.t,
        barIndex: r.barIndex,
        fold: w.fold,
      });
    });
  }

  // Aggregate metrics are computed over the *pooled* out-of-sample predictions,
  // which is the honest measure of generalisation across the whole test span.
  const aggregate = classificationMetrics(
    oos.map((p) => ({ proba: p.proba, label: p.label, forwardReturn: p.forwardReturn })),
  );

  // Representative hyperparameters (refit on the full training anchor for the
  // model's declared identity / artifact metadata).
  const anchor = fs.rows.slice(0, plan.windows[0]?.trainEnd ?? fs.rows.length);
  const identityModel = trainModel(
    anchor.map((r) => r.features),
    anchor.map((r) => r.label),
    input.modelConfig,
  );

  return {
    datasetId: input.datasetId,
    version: input.version,
    featureSetId: featureSetId(input.datasetId, input.version, input.featureConfig),
    splitId: splitId(input.datasetId, input.version, input.featureConfig, input.windowConfig),
    modelId: modelId(input),
    modelType: input.modelConfig.type,
    hyperparameters: identityModel.hyperparameters,
    featureNames: fs.featureNames,
    featureConfig: input.featureConfig,
    windowConfig: input.windowConfig,
    modelConfig: input.modelConfig,
    folds,
    aggregate,
    oos,
    featureRows: fs.rows.length,
  };
}
