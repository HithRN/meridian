/**
 * Model-agnostic explainability.
 *
 *  - Exact interventional Shapley values. With 8 features there are only
 *    2⁸ = 256 coalitions, so every coalition value is computed directly against
 *    a background sample, so there is no KernelSHAP sampling error. The efficiency axiom
 *    holds to floating point: base + Σφ = model log-odds.
 *  - Partial dependence: the average predicted probability as one feature
 *    sweeps its range, with the rest held at background values.
 *  - Calibration: reliability bins and expected calibration error (ECE).
 *  - Counterfactual recourse: the smallest tip that reaches a target landing
 *    probability, everything else unchanged. A searcher can act on this directly.
 *  - Faithfulness: agreement between a model's explanations and the ground-truth
 *    mechanism's explanations (rank correlation and cosine similarity).
 */

import { sigmoid } from "@/core/ml/stats";
import { rocAuc } from "@/core/ml/metrics";
import { FEATURES, TIP_FEATURE } from "@/core/ai/bundles";

export type LogitFn = (x: number[]) => number;

/* ----------------------------------------------------------------- SHAP */

const weightCache = new Map<number, number[]>();

/** Shapley weight |S|!(M−|S|−1)!/M! indexed by |S|. */
function shapleyWeights(M: number): number[] {
  const cached = weightCache.get(M);
  if (cached) return cached;
  const fact = [1];
  for (let i = 1; i <= M; i++) fact.push(fact[i - 1] * i);
  const w = Array.from({ length: M }, (_, s) => (fact[s] * fact[M - s - 1]) / fact[M]);
  weightCache.set(M, w);
  return w;
}

function popcount(n: number): number {
  let c = 0;
  while (n) { c += n & 1; n >>= 1; }
  return c;
}

export interface ShapExplanation {
  /** E[f(X)] over the background, in log-odds. */
  base: number;
  /** One value per feature, in log-odds. */
  phi: number[];
  /** f(x) in log-odds; equals base + Σφ. */
  value: number;
}

export function shapExact(f: LogitFn, x: readonly number[], background: readonly number[][]): ShapExplanation {
  const M = x.length;
  const nMasks = 1 << M;
  const v = new Float64Array(nMasks);
  const z = new Array<number>(M);
  for (let mask = 0; mask < nMasks; mask++) {
    let s = 0;
    for (const b of background) {
      for (let j = 0; j < M; j++) z[j] = mask & (1 << j) ? x[j] : b[j];
      s += f(z);
    }
    v[mask] = s / background.length;
  }
  const w = shapleyWeights(M);
  const phi = new Array(M).fill(0);
  for (let j = 0; j < M; j++) {
    const bit = 1 << j;
    for (let mask = 0; mask < nMasks; mask++) {
      if (mask & bit) continue;
      phi[j] += w[popcount(mask)] * (v[mask | bit] - v[mask]);
    }
  }
  return { base: v[0], phi, value: v[nMasks - 1] };
}

/** Mean |φ| per feature over a set of rows (global importance). */
export function globalImportance(f: LogitFn, rows: number[][], background: number[][]): number[] {
  const acc = new Array(rows[0].length).fill(0);
  for (const r of rows) {
    const { phi } = shapExact(f, r, background);
    phi.forEach((p, j) => (acc[j] += Math.abs(p)));
  }
  return acc.map((a) => a / rows.length);
}

/* ------------------------------------------------------------------ PDP */

export function partialDependence(f: LogitFn, background: number[][], feature: number, grid: number[]): number[] {
  return grid.map((g) => {
    let s = 0;
    for (const b of background) {
      const z = [...b];
      z[feature] = g;
      s += sigmoid(f(z));
    }
    return s / background.length;
  });
}

export function featureGrid(feature: number, points = 25): number[] {
  const { min, max } = FEATURES[feature];
  return Array.from({ length: points }, (_, i) => Math.round((min + ((max - min) * i) / (points - 1)) * 1000) / 1000);
}

/* -------------------------------------------------------------- metrics */

export interface ReliabilityBin {
  predicted: number;
  observed: number;
  count: number;
}

export interface ClassifierMetrics {
  auc: number;
  logLoss: number;
  brier: number;
  accuracy: number;
  ece: number;
  reliability: ReliabilityBin[];
}

export function evaluate(probs: number[], y: number[], bins = 10): ClassifierMetrics {
  let ll = 0, brier = 0, correct = 0;
  const bp = new Array(bins).fill(0), bo = new Array(bins).fill(0), bc = new Array(bins).fill(0);
  probs.forEach((p, i) => {
    const q = Math.min(1 - 1e-12, Math.max(1e-12, p));
    ll -= y[i] * Math.log(q) + (1 - y[i]) * Math.log(1 - q);
    brier += (p - y[i]) ** 2;
    if ((p >= 0.5 ? 1 : 0) === y[i]) correct++;
    const k = Math.min(bins - 1, Math.floor(p * bins));
    bp[k] += p; bo[k] += y[i]; bc[k]++;
  });
  const n = probs.length;
  let ece = 0;
  const reliability: ReliabilityBin[] = [];
  for (let k = 0; k < bins; k++) {
    if (!bc[k]) continue;
    const pred = bp[k] / bc[k], obs = bo[k] / bc[k];
    ece += (bc[k] / n) * Math.abs(pred - obs);
    reliability.push({ predicted: pred, observed: obs, count: bc[k] });
  }
  return {
    auc: rocAuc(probs.map((p, i) => ({ proba: p, label: y[i], forwardReturn: 0 }))),
    logLoss: ll / n,
    brier: brier / n,
    accuracy: correct / n,
    ece,
    reliability,
  };
}

/* ------------------------------------------------------- counterfactual */

/**
 * Smallest tip multiple (log₂ × p50) reaching `target` probability with the
 * other features fixed, or null if no tip in range gets there (e.g. the bundle
 * will revert regardless of tip).
 */
export function minTipForTarget(f: LogitFn, x: readonly number[], target: number): number | null {
  const { min, max } = FEATURES[TIP_FEATURE];
  const z = [...x];
  for (let t = min; t <= max + 1e-9; t += 0.05) {
    z[TIP_FEATURE] = t;
    if (sigmoid(f(z)) >= target) return Math.round(t * 100) / 100;
  }
  return null;
}

/* ---------------------------------------------------------- faithfulness */

function ranks(v: number[]): number[] {
  const order = v.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]);
  const r = new Array(v.length);
  order.forEach(([, i], k) => (r[i] = k));
  return r;
}

export function spearman(a: number[], b: number[]): number {
  const ra = ranks(a), rb = ranks(b);
  const n = a.length;
  const d2 = ra.reduce((s, r, i) => s + (r - rb[i]) ** 2, 0);
  return 1 - (6 * d2) / (n * (n * n - 1));
}

export function cosine(a: number[], b: number[]): number {
  let ab = 0, aa = 0, bb = 0;
  for (let i = 0; i < a.length; i++) { ab += a[i] * b[i]; aa += a[i] * a[i]; bb += b[i] * b[i]; }
  return aa && bb ? ab / Math.sqrt(aa * bb) : 0;
}
