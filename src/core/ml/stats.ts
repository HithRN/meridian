/**
 * Small, allocation-conscious statistics helpers shared by features, models,
 * metrics and the backtest engine. All functions are pure and deterministic.
 */

export function mean(xs: readonly number[]): number {
  if (xs.length === 0) return 0;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

export function variance(xs: readonly number[], sample = true): number {
  const n = xs.length;
  if (n < 2) return 0;
  const m = mean(xs);
  let s = 0;
  for (const x of xs) s += (x - m) * (x - m);
  return s / (sample ? n - 1 : n);
}

export function std(xs: readonly number[], sample = true): number {
  return Math.sqrt(variance(xs, sample));
}

export function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

export function sigmoid(x: number): number {
  // Numerically stable logistic.
  if (x >= 0) {
    const z = Math.exp(-x);
    return 1 / (1 + z);
  }
  const z = Math.exp(x);
  return z / (1 + z);
}

/** Standardise columns to zero mean / unit variance; returns the transform. */
export interface Standardizer {
  means: number[];
  stds: number[];
}

export function fitStandardizer(rows: number[][]): Standardizer {
  const cols = rows[0]?.length ?? 0;
  const means = new Array(cols).fill(0);
  const stds = new Array(cols).fill(1);
  for (let c = 0; c < cols; c++) {
    const col = rows.map((r) => r[c]);
    means[c] = mean(col);
    const s = std(col, false);
    stds[c] = s < 1e-12 ? 1 : s;
  }
  return { means, stds };
}

export function applyStandardizer(row: number[], t: Standardizer): number[] {
  return row.map((v, i) => (v - t.means[i]) / t.stds[i]);
}

/** Pearson correlation coefficient. */
export function correlation(xs: readonly number[], ys: readonly number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return 0;
  const mx = mean(xs);
  const my = mean(ys);
  let cov = 0;
  let vx = 0;
  let vy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    cov += dx * dy;
    vx += dx * dx;
    vy += dy * dy;
  }
  if (vx < 1e-12 || vy < 1e-12) return 0;
  return cov / Math.sqrt(vx * vy);
}

export function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = clamp(q, 0, 1) * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  const frac = pos - lo;
  return sorted[lo] * (1 - frac) + sorted[hi] * frac;
}
