/**
 * Deterministic model zoo.
 *
 * Three model families, all pure-TypeScript so they run identically in a Vercel
 * route handler and a browser Web Worker with no native dependencies:
 *
 *   - `majority`  — predicts the training base rate. The mandatory baseline;
 *                   any "real" model must beat it to be interesting.
 *   - `logistic`  — L2-regularised logistic regression via full-batch gradient
 *                   descent on standardised features.
 *   - `gbt`       — gradient-boosted decision stumps (depth-1 trees) fit to the
 *                   logistic gradient — a small, honest non-linear learner.
 *
 * Every trainer is seeded and records its hyperparameters so the experiment is
 * reproducible from the record alone.
 */

import { Rng } from "@/core/ml/rng";
import {
  sigmoid,
  fitStandardizer,
  applyStandardizer,
  type Standardizer,
} from "@/core/ml/stats";

export type ModelType = "majority" | "logistic" | "gbt";

export const MODEL_TYPES: ModelType[] = ["majority", "logistic", "gbt"];

export interface ModelConfig {
  type: ModelType;
  /** L2 penalty (logistic) — larger = stronger regularisation. */
  l2?: number;
  /** Gradient-descent learning rate (logistic). */
  learningRate?: number;
  /** Training epochs (logistic). */
  epochs?: number;
  /** Number of boosting rounds (gbt). */
  rounds?: number;
  /** Shrinkage / learning rate (gbt). */
  shrinkage?: number;
  seed?: number;
}

export interface TrainedModel {
  type: ModelType;
  hyperparameters: Record<string, number | string>;
  /** Probability that the label is 1, given a raw feature vector. */
  predictProba(x: number[]): number;
}

export function defaultModelConfig(type: ModelType): ModelConfig {
  switch (type) {
    case "majority":
      return { type, seed: 42 };
    case "logistic":
      return { type, l2: 1.0, learningRate: 0.2, epochs: 300, seed: 42 };
    case "gbt":
      return { type, rounds: 60, shrinkage: 0.1, seed: 42 };
  }
}

export function trainModel(
  X: number[][],
  y: number[],
  config: ModelConfig,
): TrainedModel {
  switch (config.type) {
    case "majority":
      return trainMajority(y, config);
    case "logistic":
      return trainLogistic(X, y, config);
    case "gbt":
      return trainGbt(X, y, config);
    default:
      throw new UnsupportedModelError((config as ModelConfig).type);
  }
}

// --------------------------------------------------------------------------
// Majority baseline
// --------------------------------------------------------------------------
function trainMajority(y: number[], config: ModelConfig): TrainedModel {
  const rate = y.length ? y.reduce((a, b) => a + b, 0) / y.length : 0.5;
  return {
    type: "majority",
    hyperparameters: { baseRate: round6(rate), seed: config.seed ?? 42 },
    predictProba: () => rate,
  };
}

// --------------------------------------------------------------------------
// L2 logistic regression (full-batch gradient descent)
// --------------------------------------------------------------------------
function trainLogistic(
  X: number[][],
  y: number[],
  config: ModelConfig,
): TrainedModel {
  const l2 = config.l2 ?? 1.0;
  const lr = config.learningRate ?? 0.2;
  const epochs = config.epochs ?? 300;
  const n = X.length;
  const d = X[0]?.length ?? 0;

  const scaler: Standardizer = fitStandardizer(X);
  const Xs = X.map((row) => applyStandardizer(row, scaler));

  const w = new Array(d).fill(0);
  let b = 0;

  for (let e = 0; e < epochs; e++) {
    const gradW = new Array(d).fill(0);
    let gradB = 0;
    for (let i = 0; i < n; i++) {
      const z = dot(w, Xs[i]) + b;
      const p = sigmoid(z);
      const err = p - y[i];
      for (let j = 0; j < d; j++) gradW[j] += err * Xs[i][j];
      gradB += err;
    }
    for (let j = 0; j < d; j++) {
      // Average gradient + L2 penalty (bias is not penalised).
      w[j] -= lr * (gradW[j] / n + (l2 * w[j]) / n);
    }
    b -= lr * (gradB / n);
  }

  return {
    type: "logistic",
    hyperparameters: {
      l2: round6(l2),
      learningRate: lr,
      epochs,
      features: d,
      seed: config.seed ?? 42,
    },
    predictProba: (x: number[]) => sigmoid(dot(w, applyStandardizer(x, scaler)) + b),
  };
}

// --------------------------------------------------------------------------
// Gradient-boosted decision stumps
// --------------------------------------------------------------------------
interface Stump {
  feature: number;
  threshold: number;
  left: number; // additive log-odds contribution
  right: number;
}

function trainGbt(
  X: number[][],
  y: number[],
  config: ModelConfig,
): TrainedModel {
  const rounds = config.rounds ?? 60;
  const shrinkage = config.shrinkage ?? 0.1;
  const rng = new Rng(config.seed ?? 42);
  const n = X.length;
  const d = X[0]?.length ?? 0;

  const base = Math.log(clampProb(mean(y)) / (1 - clampProb(mean(y))));
  const scores = new Array(n).fill(base);
  const stumps: Stump[] = [];

  // Candidate thresholds per feature: quantile grid (deterministic).
  const thresholds: number[][] = [];
  for (let f = 0; f < d; f++) {
    const col = X.map((r) => r[f]).sort((a, b) => a - b);
    const grid: number[] = [];
    for (let q = 1; q <= 8; q++) grid.push(col[Math.floor((q / 9) * (n - 1))]);
    thresholds.push(grid);
  }

  for (let r = 0; r < rounds; r++) {
    // Negative gradient of logloss = residual (y - p).
    const residual = new Array(n);
    for (let i = 0; i < n; i++) residual[i] = y[i] - sigmoid(scores[i]);

    // Subsample features each round for a little decorrelation (seeded).
    const featOrder = rng.shuffle([...Array(d).keys()]);
    let best: { stump: Stump; gain: number } | null = null;

    for (const f of featOrder) {
      for (const thr of thresholds[f]) {
        let ls = 0;
        let lc = 0;
        let rs = 0;
        let rc = 0;
        for (let i = 0; i < n; i++) {
          if (X[i][f] <= thr) {
            ls += residual[i];
            lc++;
          } else {
            rs += residual[i];
            rc++;
          }
        }
        if (lc === 0 || rc === 0) continue;
        const left = ls / lc;
        const right = rs / rc;
        const gain = (ls * ls) / lc + (rs * rs) / rc;
        if (!best || gain > best.gain) {
          best = { stump: { feature: f, threshold: thr, left, right }, gain };
        }
      }
    }
    if (!best) break;
    stumps.push(best.stump);
    for (let i = 0; i < n; i++) {
      const s = best.stump;
      scores[i] += shrinkage * (X[i][s.feature] <= s.threshold ? s.left : s.right);
    }
  }

  return {
    type: "gbt",
    hyperparameters: {
      rounds: stumps.length,
      shrinkage,
      features: d,
      seed: config.seed ?? 42,
    },
    predictProba: (x: number[]) => {
      let s = base;
      for (const st of stumps) {
        s += shrinkage * (x[st.feature] <= st.threshold ? st.left : st.right);
      }
      return sigmoid(s);
    },
  };
}

// --------------------------------------------------------------------------
// helpers
// --------------------------------------------------------------------------
function dot(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0.5;
}

function clampProb(p: number): number {
  return Math.min(1 - 1e-6, Math.max(1e-6, p));
}

function round6(x: number): number {
  return Math.round(x * 1e6) / 1e6;
}

export class UnsupportedModelError extends Error {
  constructor(type: string) {
    super(`Unsupported model type: ${type}`);
    this.name = "UnsupportedModelError";
  }
}
