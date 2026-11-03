/**
 * Landing-probability models, implemented from scratch in TypeScript.
 *
 *   logistic: L2-regularised logistic regression (the interpretable baseline)
 *   gbt:      gradient-boosted trees: Newton (XGBoost-style) leaf values,
 *              histogram split finding, depth-3 trees, early stopping
 *   mlp:      a neural network (8 → 24 ReLU → 1) trained with Adam,
 *              mini-batches, weight decay and early stopping
 *
 * Every model is plain JSON data, and `logit()` evaluates any of them, so the
 * same trained model runs on the server (copilot tool) and in the browser
 * (what-if explorer, live Shapley values). All training is seeded.
 */

import { Rng } from "@/core/ml/rng";
import { sigmoid, fitStandardizer } from "@/core/ml/stats";

export type ModelId = "logistic" | "gbt" | "mlp";
export const MODEL_IDS: ModelId[] = ["logistic", "gbt", "mlp"];
export const MODEL_NAMES: Record<ModelId | "truth", string> = {
  logistic: "Logistic regression",
  gbt: "Gradient-boosted trees",
  mlp: "Neural network (MLP)",
  truth: "Ground truth",
};

export interface LogisticModel {
  kind: "logistic";
  mean: number[];
  std: number[];
  w: number[];
  b: number;
}

/** Flat tree node: leaf when f < 0 (value v); else go left when x[f] <= t. */
export interface TreeNode {
  f: number;
  t: number;
  l: number;
  r: number;
  v: number;
}

export interface GbtModel {
  kind: "gbt";
  base: number;
  trees: TreeNode[][];
}

export interface MlpModel {
  kind: "mlp";
  mean: number[];
  std: number[];
  W1: number[][]; // hidden × input
  b1: number[];
  w2: number[];
  b2: number;
}

export type Model = LogisticModel | GbtModel | MlpModel;

export interface CurvePoint {
  step: number;
  train: number;
  valid: number;
}

export interface TrainResult<M extends Model> {
  model: M;
  curve: CurvePoint[];
  /** Iterations kept after early stopping. */
  bestStep: number;
}

/* ------------------------------------------------------------- inference */

export function logit(m: Model, x: readonly number[]): number {
  switch (m.kind) {
    case "logistic": {
      let z = m.b;
      for (let j = 0; j < x.length; j++) z += m.w[j] * ((x[j] - m.mean[j]) / m.std[j]);
      return z;
    }
    case "gbt": {
      let z = m.base;
      for (const tree of m.trees) {
        let n = 0;
        while (tree[n].f >= 0) n = x[tree[n].f] <= tree[n].t ? tree[n].l : tree[n].r;
        z += tree[n].v;
      }
      return z;
    }
    case "mlp": {
      let z = m.b2;
      for (let h = 0; h < m.b1.length; h++) {
        let a = m.b1[h];
        const row = m.W1[h];
        for (let j = 0; j < x.length; j++) a += row[j] * ((x[j] - m.mean[j]) / m.std[j]);
        if (a > 0) z += m.w2[h] * a;
      }
      return z;
    }
  }
}

export function predictProba(m: Model, x: readonly number[]): number {
  return sigmoid(logit(m, x));
}

export function logLoss(f: (x: number[]) => number, X: number[][], y: number[]): number {
  let s = 0;
  for (let i = 0; i < X.length; i++) {
    const p = Math.min(1 - 1e-12, Math.max(1e-12, sigmoid(f(X[i]))));
    s -= y[i] * Math.log(p) + (1 - y[i]) * Math.log(1 - p);
  }
  return s / X.length;
}

/* -------------------------------------------------------------- logistic */

export function trainLogistic(X: number[][], y: number[], Xv: number[][], yv: number[]): TrainResult<LogisticModel> {
  const { means, stds } = fitStandardizer(X);
  const Z = X.map((r) => r.map((v, j) => (v - means[j]) / stds[j]));
  const d = X[0].length;
  const w = new Array(d).fill(0);
  let b = 0;
  const lr = 0.5;
  const l2 = 1e-3;
  const curve: CurvePoint[] = [];
  const model = (): LogisticModel => ({ kind: "logistic", mean: means, std: stds, w: [...w], b });

  for (let it = 1; it <= 400; it++) {
    const gw = new Array(d).fill(0);
    let gb = 0;
    for (let i = 0; i < Z.length; i++) {
      let z = b;
      for (let j = 0; j < d; j++) z += w[j] * Z[i][j];
      const g = sigmoid(z) - y[i];
      gb += g;
      for (let j = 0; j < d; j++) gw[j] += g * Z[i][j];
    }
    for (let j = 0; j < d; j++) w[j] -= lr * (gw[j] / Z.length + l2 * w[j]);
    b -= (lr * gb) / Z.length;
    if (it % 20 === 0) {
      const m = model();
      curve.push({ step: it, train: logLoss((x) => logit(m, x), X, y), valid: logLoss((x) => logit(m, x), Xv, yv) });
    }
  }
  return { model: model(), curve, bestStep: 400 };
}

/* ------------------------------------------------------------------- gbt */

interface GbtParams {
  rounds: number;
  lr: number;
  depth: number;
  lambda: number;
  minLeaf: number;
  bins: number;
  patience: number;
}

const GBT_DEFAULTS: GbtParams = { rounds: 400, lr: 0.08, depth: 3, lambda: 1, minLeaf: 30, bins: 32, patience: 30 };

export function trainGbt(
  X: number[][],
  y: number[],
  Xv: number[][],
  yv: number[],
  params: Partial<GbtParams> = {},
): TrainResult<GbtModel> {
  const p = { ...GBT_DEFAULTS, ...params };
  const n = X.length;
  const d = X[0].length;

  // Quantile cut points per feature, and each row's bin index.
  const cuts: number[][] = [];
  const binned: Uint8Array[] = [];
  for (let j = 0; j < d; j++) {
    const sorted = X.map((r) => r[j]).sort((a, b) => a - b);
    const c: number[] = [];
    for (let k = 1; k < p.bins; k++) {
      const v = sorted[Math.floor((k / p.bins) * n)];
      if (c.length === 0 || v > c[c.length - 1]) c.push(v);
    }
    cuts.push(c);
    const col = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      let lo = 0;
      while (lo < c.length && X[i][j] > c[lo]) lo++;
      col[i] = lo; // bin k ⇔ x <= c[k] (or beyond last cut)
    }
    binned.push(col);
  }

  const mean = y.reduce((a, b) => a + b, 0) / n;
  const base = Math.log(mean / (1 - mean));
  const F = new Float64Array(n).fill(base);
  const Fv = new Float64Array(Xv.length).fill(base);
  const g = new Float64Array(n);
  const h = new Float64Array(n);
  const trees: TreeNode[][] = [];
  const curve: CurvePoint[] = [];
  let best = Infinity;
  let bestStep = 0;

  const lossOf = (Fs: Float64Array, ys: number[]) => {
    let s = 0;
    for (let i = 0; i < ys.length; i++) {
      const q = Math.min(1 - 1e-12, Math.max(1e-12, sigmoid(Fs[i])));
      s -= ys[i] * Math.log(q) + (1 - ys[i]) * Math.log(1 - q);
    }
    return s / ys.length;
  };

  const buildNode = (tree: TreeNode[], idx: number[], depth: number): number => {
    let G = 0, H = 0;
    for (const i of idx) { G += g[i]; H += h[i]; }
    const nodeId = tree.length;
    tree.push({ f: -1, t: 0, l: -1, r: -1, v: (-G / (H + p.lambda)) * p.lr });
    if (depth >= p.depth || idx.length < 2 * p.minLeaf) return nodeId;

    let bestGain = 1e-6, bestF = -1, bestBin = -1;
    const parent = (G * G) / (H + p.lambda);
    for (let j = 0; j < d; j++) {
      const nb = cuts[j].length + 1;
      const hg = new Float64Array(nb), hh = new Float64Array(nb), hc = new Int32Array(nb);
      const col = binned[j];
      for (const i of idx) { hg[col[i]] += g[i]; hh[col[i]] += h[i]; hc[col[i]]++; }
      let GL = 0, HL = 0, CL = 0;
      for (let k = 0; k < nb - 1; k++) {
        GL += hg[k]; HL += hh[k]; CL += hc[k];
        const CR = idx.length - CL;
        if (CL < p.minLeaf || CR < p.minLeaf) continue;
        const GR = G - GL, HR = H - HL;
        const gain = (GL * GL) / (HL + p.lambda) + (GR * GR) / (HR + p.lambda) - parent;
        if (gain > bestGain) { bestGain = gain; bestF = j; bestBin = k; }
      }
    }
    if (bestF < 0) return nodeId;
    const left: number[] = [], right: number[] = [];
    for (const i of idx) (binned[bestF][i] <= bestBin ? left : right).push(i);
    const node = tree[nodeId];
    node.f = bestF;
    node.t = cuts[bestF][bestBin];
    node.l = buildNode(tree, left, depth + 1);
    node.r = buildNode(tree, right, depth + 1);
    return nodeId;
  };

  const all = Array.from({ length: n }, (_, i) => i);
  for (let round = 1; round <= p.rounds; round++) {
    for (let i = 0; i < n; i++) {
      const q = sigmoid(F[i]);
      g[i] = q - y[i];
      h[i] = Math.max(q * (1 - q), 1e-6);
    }
    const tree: TreeNode[] = [];
    buildNode(tree, all, 0);
    trees.push(tree);
    const one: GbtModel = { kind: "gbt", base: 0, trees: [tree] };
    for (let i = 0; i < n; i++) F[i] += logit(one, X[i]);
    for (let i = 0; i < Xv.length; i++) Fv[i] += logit(one, Xv[i]);

    const vl = lossOf(Fv, yv);
    if (round % 10 === 0 || round === 1) curve.push({ step: round, train: lossOf(F, y), valid: vl });
    if (vl < best - 1e-5) { best = vl; bestStep = round; }
    else if (round - bestStep >= p.patience) break;
  }
  return { model: { kind: "gbt", base, trees: trees.slice(0, bestStep) }, curve, bestStep };
}

/* ------------------------------------------------------------------- mlp */

export function trainMlp(
  X: number[][],
  y: number[],
  Xv: number[][],
  yv: number[],
  seed = 7,
  hidden = 24,
  maxEpochs = 60,
): TrainResult<MlpModel> {
  const rng = new Rng(seed);
  const { means, stds } = fitStandardizer(X);
  const Z = X.map((r) => r.map((v, j) => (v - means[j]) / stds[j]));
  const d = X[0].length;
  const H = hidden;

  // He initialisation.
  const W1 = Array.from({ length: H }, () => Array.from({ length: d }, () => rng.normal(0, Math.sqrt(2 / d))));
  const b1 = new Array(H).fill(0);
  const w2 = Array.from({ length: H }, () => rng.normal(0, Math.sqrt(1 / H)));
  let b2 = 0;

  // Adam state.
  const lr = 3e-3, beta1 = 0.9, beta2 = 0.999, eps = 1e-8, wd = 1e-4, batch = 64;
  const mW1 = W1.map((r) => r.map(() => 0)), vW1 = W1.map((r) => r.map(() => 0));
  const mb1 = new Array(H).fill(0), vb1 = new Array(H).fill(0);
  const mw2 = new Array(H).fill(0), vw2 = new Array(H).fill(0);
  let mb2 = 0, vb2 = 0, t = 0;

  const snapshot = (): MlpModel => ({ kind: "mlp", mean: means, std: stds, W1: W1.map((r) => [...r]), b1: [...b1], w2: [...w2], b2 });
  const curve: CurvePoint[] = [];
  let best = Infinity, bestModel = snapshot(), bestStep = 0, since = 0;
  const order = Array.from({ length: Z.length }, (_, i) => i);
  const a = new Array(H).fill(0);

  for (let epoch = 1; epoch <= maxEpochs; epoch++) {
    for (let i = order.length - 1; i > 0; i--) {
      const k = Math.floor(rng.next() * (i + 1));
      [order[i], order[k]] = [order[k], order[i]];
    }
    for (let s = 0; s < order.length; s += batch) {
      const gW1 = W1.map((r) => r.map(() => 0));
      const gb1 = new Array(H).fill(0), gw2 = new Array(H).fill(0);
      let gb2 = 0;
      const end = Math.min(order.length, s + batch);
      for (let q = s; q < end; q++) {
        const i = order[q], xi = Z[i];
        let z = b2;
        for (let hh = 0; hh < H; hh++) {
          let v = b1[hh];
          for (let j = 0; j < d; j++) v += W1[hh][j] * xi[j];
          a[hh] = v > 0 ? v : 0;
          z += w2[hh] * a[hh];
        }
        const dz = sigmoid(z) - y[i];
        gb2 += dz;
        for (let hh = 0; hh < H; hh++) {
          gw2[hh] += dz * a[hh];
          if (a[hh] > 0) {
            const da = dz * w2[hh];
            gb1[hh] += da;
            for (let j = 0; j < d; j++) gW1[hh][j] += da * xi[j];
          }
        }
      }
      const m = end - s;
      t++;
      const c1 = 1 - Math.pow(beta1, t), c2 = 1 - Math.pow(beta2, t);
      const step = (param: number, grad: number, mArr: number[], vArr: number[], k: number, decay: boolean) => {
        const gg = grad / m + (decay ? wd * param : 0);
        mArr[k] = beta1 * mArr[k] + (1 - beta1) * gg;
        vArr[k] = beta2 * vArr[k] + (1 - beta2) * gg * gg;
        return param - (lr * (mArr[k] / c1)) / (Math.sqrt(vArr[k] / c2) + eps);
      };
      for (let hh = 0; hh < H; hh++) {
        for (let j = 0; j < d; j++) W1[hh][j] = step(W1[hh][j], gW1[hh][j], mW1[hh], vW1[hh], j, true);
        b1[hh] = step(b1[hh], gb1[hh], mb1, vb1, hh, false);
        w2[hh] = step(w2[hh], gw2[hh], mw2, vw2, hh, true);
      }
      const gg = gb2 / m;
      mb2 = beta1 * mb2 + (1 - beta1) * gg;
      vb2 = beta2 * vb2 + (1 - beta2) * gg * gg;
      b2 -= (lr * (mb2 / c1)) / (Math.sqrt(vb2 / c2) + eps);
    }
    const cur = snapshot();
    const vl = logLoss((x) => logit(cur, x), Xv, yv);
    curve.push({ step: epoch, train: logLoss((x) => logit(cur, x), X, y), valid: vl });
    if (vl < best - 1e-5) { best = vl; bestModel = cur; bestStep = epoch; since = 0; }
    else if (++since >= 8) break;
  }
  return { model: bestModel, curve, bestStep };
}
