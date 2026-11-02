/**
 * The bundle-landing AI lab: simulate → train three models → evaluate →
 * explain → check the explanations against ground truth. Built once per server
 * instance and cached; the report is plain JSON so the browser can re-run any
 * model and its Shapley values locally for the what-if explorer.
 */

import { sigmoid } from "@/core/ml/stats";
import { hashValue } from "@/core/hash";
import { FEATURES, TIP_FEATURE, generateBundles, trueLogit } from "@/core/ai/bundles";
import {
  MODEL_IDS,
  logit,
  trainGbt,
  trainLogistic,
  trainMlp,
  type CurvePoint,
  type Model,
  type ModelId,
} from "@/core/ai/models";
import {
  cosine,
  evaluate,
  featureGrid,
  partialDependence,
  shapExact,
  spearman,
  type ClassifierMetrics,
} from "@/core/ai/explain";

export const LAB_SEED = 20261102;
const N_TRAIN = 5000, N_VALID = 1000, N_TEST = 2000;
const PDP_FEATURES = [TIP_FEATURE, 2, 7, 5]; // tip, competition, state drift, slots to leader

export type Explained = ModelId | "truth";

export interface LabReport {
  datasetHash: string;
  split: { train: number; valid: number; test: number; baseRate: number };
  models: Record<ModelId, Model>;
  training: Record<ModelId, { curve: CurvePoint[]; bestStep: number; ms: number }>;
  metrics: Record<ModelId | "oracle", ClassifierMetrics>;
  importance: Record<Explained, number[]>;
  /** Agreement of each model's explanations with the ground-truth mechanism's. */
  faithfulness: Record<ModelId, { globalCosine: number; localCosine: number; top3Overlap: number; rankCorrelation: number }>;
  pdp: Array<{ feature: number; grid: number[]; curves: Record<Explained, number[]> }>;
  /** Background sample used for Shapley values and PDPs. */
  background: number[][];
  builtMs: number;
}

let cached: LabReport | null = null;

function topK(v: number[], k: number): number[] {
  return v.map((x, i) => [x, i] as const).sort((a, b) => b[0] - a[0]).slice(0, k).map(([, i]) => i);
}

function overlap(a: number[], b: number[]): number {
  return a.filter((i) => b.includes(i)).length;
}

export function getLab(): LabReport {
  if (cached) return cached;
  const started = Date.now();
  const all = generateBundles(N_TRAIN + N_VALID + N_TEST, LAB_SEED);
  const slice = (a: number, b: number) => ({ X: all.X.slice(a, b), y: all.y.slice(a, b) });
  const train = slice(0, N_TRAIN);
  const valid = slice(N_TRAIN, N_TRAIN + N_VALID);
  const test = slice(N_TRAIN + N_VALID, N_TRAIN + N_VALID + N_TEST);

  const timed = <T,>(fn: () => T) => {
    const t0 = Date.now();
    const r = fn();
    return { r, ms: Date.now() - t0 };
  };
  const lr = timed(() => trainLogistic(train.X, train.y, valid.X, valid.y));
  const gbt = timed(() => trainGbt(train.X, train.y, valid.X, valid.y));
  const mlp = timed(() => trainMlp(train.X, train.y, valid.X, valid.y, LAB_SEED));

  const models: Record<ModelId, Model> = { logistic: lr.r.model, gbt: gbt.r.model, mlp: mlp.r.model };
  const fns: Record<Explained, (x: number[]) => number> = {
    logistic: (x) => logit(models.logistic, x),
    gbt: (x) => logit(models.gbt, x),
    mlp: (x) => logit(models.mlp, x),
    truth: (x) => trueLogit(x),
  };

  const metrics = {} as LabReport["metrics"];
  for (const id of MODEL_IDS) metrics[id] = evaluate(test.X.map((x) => sigmoid(fns[id](x))), test.y);
  metrics.oracle = evaluate(test.X.map((x) => sigmoid(trueLogit(x))), test.y);

  // Background and explained rows drawn from the held-out test split.
  const background = test.X.slice(0, 24);
  const explainRows = test.X.slice(100, 140);
  const importance = {} as LabReport["importance"];
  const local = {} as Record<Explained, number[][]>;
  for (const id of [...MODEL_IDS, "truth"] as Explained[]) {
    local[id] = explainRows.map((r) => shapExact(fns[id], r, background).phi);
    importance[id] = FEATURES.map((_, j) => local[id].reduce((s, phi) => s + Math.abs(phi[j]), 0) / explainRows.length);
  }
  const faithfulness = {} as LabReport["faithfulness"];
  for (const id of MODEL_IDS) {
    faithfulness[id] = {
      globalCosine: cosine(importance[id], importance.truth),
      localCosine: local[id].reduce((s, phi, i) => s + cosine(phi, local.truth[i]), 0) / explainRows.length,
      top3Overlap: overlap(topK(importance[id], 3), topK(importance.truth, 3)) / 3,
      rankCorrelation: spearman(importance[id], importance.truth),
    };
  }

  const pdp = PDP_FEATURES.map((feature) => {
    const grid = featureGrid(feature);
    const curves = {} as Record<Explained, number[]>;
    for (const id of [...MODEL_IDS, "truth"] as Explained[]) curves[id] = partialDependence(fns[id], background, feature, grid);
    return { feature, grid, curves };
  });

  cached = {
    datasetHash: hashValue(all.X.slice(0, 500)).slice(0, 12),
    split: { train: N_TRAIN, valid: N_VALID, test: N_TEST, baseRate: all.y.reduce((a, b) => a + b, 0) / all.y.length },
    models,
    training: {
      logistic: { curve: lr.r.curve, bestStep: lr.r.bestStep, ms: lr.ms },
      gbt: { curve: gbt.r.curve, bestStep: gbt.r.bestStep, ms: gbt.ms },
      mlp: { curve: mlp.r.curve, bestStep: mlp.r.bestStep, ms: mlp.ms },
    },
    metrics,
    importance,
    faithfulness,
    pdp,
    background,
    builtMs: Date.now() - started,
  };
  return cached;
}
