/**
 * Statistics for live market research. Market returns are autocorrelated and
 * fat-tailed, so the tests here use autocorrelation-robust (Newey-West) standard
 * errors and block resampling rather than textbook formulas that assume
 * independent, normal data. All functions are pure; randomness is seeded.
 */

import { Rng } from "@/core/ml/rng";
import { correlation, mean, quantile, std } from "@/core/ml/stats";

/* ------------------------------------------------------------- distributions */

function logGamma(x: number): number {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.001208650973866179, -0.000005395239384953];
  let y = x;
  const tmp = x + 5.5 - (x + 0.5) * Math.log(x + 5.5);
  let ser = 1.000000000190015;
  for (const v of c) ser += v / ++y;
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}

function betaContinuedFraction(a: number, b: number, x: number): number {
  const FPMIN = 1e-300;
  let c = 1;
  let d = 1 - ((a + b) * x) / (a + 1);
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 300; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((a - 1 + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + 1 + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-12) break;
  }
  return h;
}

function regularizedBeta(a: number, b: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? (front * betaContinuedFraction(a, b, x)) / a : 1 - (front * betaContinuedFraction(b, a, 1 - x)) / b;
}

/** Two-sided p-value of a t statistic. */
export function tTestP(t: number, df: number): number {
  if (!Number.isFinite(t) || df <= 0) return 1;
  return regularizedBeta(df / 2, 0.5, df / (df + t * t));
}

/** Upper-tail probability of a chi-squared statistic. */
export function chiSquareP(x: number, df: number): number {
  if (!(x > 0)) return 1;
  const a = df / 2;
  const z = x / 2;
  const prefix = Math.exp(-z + a * Math.log(z) - logGamma(a));
  if (z < a + 1) {
    let sum = 1 / a;
    let term = sum;
    for (let n = 1; n < 500; n++) {
      term *= z / (a + n);
      sum += term;
      if (Math.abs(term) < Math.abs(sum) * 1e-14) break;
    }
    return Math.max(0, 1 - sum * prefix);
  }
  let b = z + 1 - a;
  let c = 1e300;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 500; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c;
    if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-14) break;
  }
  return Math.min(1, prefix * h);
}

/** Two-sided p-value of a z statistic. */
export const zTestP = (z: number): number => tTestP(z, 1e6);

/* ---------------------------------------------------------- robust inference */

/** Bartlett bandwidth from the Newey-West (1994) rule of thumb. */
export const autoLag = (n: number): number => Math.floor(4 * (n / 100) ** (2 / 9));

/** Long-run variance of a mean-zero series, allowing for autocorrelation. */
function longRunVariance(centered: readonly number[], lag: number): number {
  const n = centered.length;
  let v = 0;
  for (const x of centered) v += x * x;
  v /= n;
  for (let l = 1; l <= lag && l < n; l++) {
    let g = 0;
    for (let i = l; i < n; i++) g += centered[i] * centered[i - l];
    v += 2 * (1 - l / (lag + 1)) * (g / n);
  }
  return Math.max(0, v);
}

export interface MeanTest {
  n: number;
  mean: number;
  se: number;
  t: number;
  p: number;
}

/** Test whether a series' mean differs from `against`, robust to autocorrelation. */
export function hacMeanTest(xs: readonly number[], against = 0, lag?: number): MeanTest {
  const n = xs.length;
  const m = mean(xs);
  if (n < 3) return { n, mean: m, se: 0, t: 0, p: 1 };
  const se = Math.sqrt(longRunVariance(xs.map((x) => x - m), lag ?? autoLag(n)) / n);
  const t = se > 0 ? (m - against) / se : 0;
  return { n, mean: m, se, t, p: tTestP(t, n - 1) };
}

/** Difference in means between two separate samples. */
export function hacDiffTest(a: readonly number[], b: readonly number[]): { diff: number; z: number; p: number } {
  const ta = hacMeanTest(a);
  const tb = hacMeanTest(b);
  const diff = ta.mean - tb.mean;
  const se = Math.hypot(ta.se, tb.se);
  const z = se > 0 ? diff / se : 0;
  return { diff, z, p: zTestP(z) };
}

export interface Regression {
  n: number;
  alpha: number;
  beta: number;
  se: number;
  t: number;
  p: number;
  r2: number;
}

/** Simple regression with Newey-West standard error on the slope. */
export function hacRegression(x: readonly number[], y: readonly number[], lag?: number): Regression {
  const n = Math.min(x.length, y.length);
  const mx = mean(x.slice(0, n));
  const my = mean(y.slice(0, n));
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (x[i] - mx) ** 2;
    sxy += (x[i] - mx) * (y[i] - my);
    syy += (y[i] - my) ** 2;
  }
  if (n < 4 || sxx <= 0) return { n, alpha: my, beta: 0, se: 0, t: 0, p: 1, r2: 0 };
  const beta = sxy / sxx;
  const alpha = my - beta * mx;
  const scores: number[] = [];
  let ssr = 0;
  for (let i = 0; i < n; i++) {
    const e = y[i] - alpha - beta * x[i];
    ssr += e * e;
    scores.push((x[i] - mx) * e);
  }
  const se = Math.sqrt(n * longRunVariance(scores, lag ?? autoLag(n))) / sxx;
  const t = se > 0 ? beta / se : 0;
  return { n, alpha, beta, se, t, p: tTestP(t, n - 2), r2: syy > 0 ? 1 - ssr / syy : 0 };
}

/** Benjamini-Hochberg adjusted p-values, in the original order. */
export function benjaminiHochberg(ps: readonly number[]): number[] {
  const m = ps.length;
  const order = ps.map((p, i) => ({ p, i })).sort((a, b) => b.p - a.p);
  const out = new Array<number>(m);
  let running = 1;
  order.forEach(({ p, i }, r) => {
    running = Math.min(running, (p * m) / (m - r));
    out[i] = running;
  });
  return out;
}

/* ----------------------------------------------------------------- resampling */

export const blockLength = (n: number): number => Math.max(2, Math.round(n ** (1 / 3)));

/** Fill `out` with a circular moving-block resample of `xs`. */
function resampleInto(xs: readonly number[], out: number[], block: number, rng: Rng) {
  const n = xs.length;
  let i = 0;
  while (i < n) {
    let start = rng.int(0, n - 1);
    for (let k = 0; k < block && i < n; k++) {
      out[i++] = xs[start];
      start = start + 1 === n ? 0 : start + 1;
    }
  }
}

/** Percentile confidence interval from a moving-block bootstrap. */
export function blockBootstrapCI(
  xs: readonly number[],
  stat: (sample: readonly number[]) => number,
  { level = 0.95, resamples = 1000, seed = 42, block }: { level?: number; resamples?: number; seed?: number; block?: number } = {},
): { lo: number; hi: number } {
  if (xs.length < 4) return { lo: NaN, hi: NaN };
  const rng = new Rng(seed);
  const buffer = new Array<number>(xs.length);
  const stats: number[] = [];
  for (let b = 0; b < resamples; b++) {
    resampleInto(xs, buffer, block ?? blockLength(xs.length), rng);
    stats.push(stat(buffer));
  }
  stats.sort((a, b) => a - b);
  const tail = (1 - level) / 2;
  return { lo: quantile(stats, tail), hi: quantile(stats, 1 - tail) };
}

/* -------------------------------------------------------------- descriptive */

export function logReturns(closes: readonly number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < closes.length; i++) out.push(Math.log(closes[i] / closes[i - 1]));
  return out;
}

export function skewness(xs: readonly number[]): number {
  const s = std(xs, false);
  if (!(s > 0)) return 0;
  const m = mean(xs);
  return mean(xs.map((x) => ((x - m) / s) ** 3));
}

export function excessKurtosis(xs: readonly number[]): number {
  const s = std(xs, false);
  if (!(s > 0)) return 0;
  const m = mean(xs);
  return mean(xs.map((x) => ((x - m) / s) ** 4)) - 3;
}

export function jarqueBera(xs: readonly number[]): { stat: number; p: number } {
  const n = xs.length;
  const stat = (n / 6) * (skewness(xs) ** 2 + excessKurtosis(xs) ** 2 / 4);
  return { stat, p: chiSquareP(stat, 2) };
}

export function autocorrelations(xs: readonly number[], lags: number): number[] {
  const n = xs.length;
  const m = mean(xs);
  let denom = 0;
  for (const x of xs) denom += (x - m) ** 2;
  if (denom <= 0) return new Array(lags).fill(0);
  return Array.from({ length: lags }, (_, k) => {
    let num = 0;
    for (let i = k + 1; i < n; i++) num += (xs[i] - m) * (xs[i - k - 1] - m);
    return num / denom;
  });
}

/** Ljung-Box test that the first `lags` autocorrelations are jointly zero. */
export function ljungBox(xs: readonly number[], lags: number): { q: number; p: number } {
  const n = xs.length;
  const acf = autocorrelations(xs, lags);
  const q = n * (n + 2) * acf.reduce((s, r, k) => s + (r * r) / (n - k - 1), 0);
  return { q, p: chiSquareP(q, lags) };
}

/** Ranks from 1, with ties sharing their average rank. */
export function ranks(xs: readonly number[]): number[] {
  const order = xs.map((x, i) => ({ x, i })).sort((a, b) => a.x - b.x);
  const out = new Array<number>(xs.length);
  let i = 0;
  while (i < order.length) {
    let j = i;
    while (j + 1 < order.length && order[j + 1].x === order[i].x) j++;
    for (let k = i; k <= j; k++) out[order[k].i] = (i + j) / 2 + 1;
    i = j + 1;
  }
  return out;
}

export function spearman(x: readonly number[], y: readonly number[]): { rho: number; p: number } {
  const n = Math.min(x.length, y.length);
  if (n < 4) return { rho: 0, p: 1 };
  const rho = correlation(ranks(x.slice(0, n)), ranks(y.slice(0, n)));
  const safe = Math.min(0.999999, Math.abs(rho));
  return { rho, p: tTestP((safe * Math.sqrt(n - 2)) / Math.sqrt(1 - safe * safe), n - 2) };
}

/** Do several groups come from the same distribution? No normality assumption. */
export function kruskalWallis(groups: readonly (readonly number[])[]): { h: number; p: number } {
  const usable = groups.filter((g) => g.length > 0);
  const all = usable.flat();
  const n = all.length;
  if (usable.length < 2 || n < 3) return { h: 0, p: 1 };
  const r = ranks(all);
  let at = 0;
  let sum = 0;
  for (const g of usable) {
    let total = 0;
    for (let i = 0; i < g.length; i++) total += r[at + i];
    at += g.length;
    sum += (total * total) / g.length;
  }
  const h = (12 / (n * (n + 1))) * sum - 3 * (n + 1);
  return { h, p: chiSquareP(h, usable.length - 1) };
}

/** 95% interval for a correlation via the Fisher transform. */
export function fisherCI(r: number, n: number): { lo: number; hi: number } {
  if (n < 4) return { lo: -1, hi: 1 };
  const z = Math.atanh(Math.max(-0.999999, Math.min(0.999999, r)));
  const se = 1 / Math.sqrt(n - 3);
  return { lo: Math.tanh(z - 1.96 * se), hi: Math.tanh(z + 1.96 * se) };
}

/** Test that two independent correlations are equal. */
export function correlationDiffTest(r1: number, n1: number, r2: number, n2: number): { z: number; p: number } {
  if (n1 < 4 || n2 < 4) return { z: 0, p: 1 };
  const atanh = (r: number) => Math.atanh(Math.max(-0.999999, Math.min(0.999999, r)));
  const z = (atanh(r1) - atanh(r2)) / Math.sqrt(1 / (n1 - 3) + 1 / (n2 - 3));
  return { z, p: zTestP(z) };
}

/** Share of `sorted` values at or below `v`, 0 to 1. */
export function percentileRank(sorted: readonly number[], v: number): number {
  if (!sorted.length) return 0;
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] <= v) lo = mid + 1;
    else hi = mid;
  }
  return lo / sorted.length;
}

export function rollingStd(xs: readonly number[], window: number): Array<number | null> {
  const out: Array<number | null> = new Array(xs.length).fill(null);
  if (window < 2) return out;
  let sum = 0;
  let sq = 0;
  for (let i = 0; i < xs.length; i++) {
    sum += xs[i];
    sq += xs[i] * xs[i];
    if (i >= window) {
      sum -= xs[i - window];
      sq -= xs[i - window] * xs[i - window];
    }
    if (i >= window - 1) out[i] = Math.sqrt(Math.max(0, (sq - (sum * sum) / window) / (window - 1)));
  }
  return out;
}

export function rollingCorrelation(a: readonly number[], b: readonly number[], window: number): Array<number | null> {
  return a.map((_, i) => (i < window - 1 ? null : correlation(a.slice(i - window + 1, i + 1), b.slice(i - window + 1, i + 1))));
}

/** Fall from the running peak at each point, as a negative fraction. */
export function underwater(closes: readonly number[]): number[] {
  let peak = -Infinity;
  return closes.map((c) => {
    peak = Math.max(peak, c);
    return c / peak - 1;
  });
}

export interface HistogramBin {
  from: number;
  to: number;
  mid: number;
  count: number;
  /** Count a normal curve with the same mean and spread would predict. */
  normal: number;
}

export const normalCdf = (x: number): number => (x < 0 ? zTestP(x) / 2 : 1 - zTestP(x) / 2);

/** Equal-width bins across the central 99.5%; outliers fall in the end bins. */
export function histogram(xs: readonly number[], bins = 31): HistogramBin[] {
  if (xs.length < 2) return [];
  const sorted = [...xs].sort((a, b) => a - b);
  const lo = quantile(sorted, 0.0025);
  const hi = quantile(sorted, 0.9975);
  if (!(hi > lo)) return [];
  const width = (hi - lo) / bins;
  const m = mean(xs);
  const s = std(xs);
  const out: HistogramBin[] = Array.from({ length: bins }, (_, i) => {
    const from = lo + i * width;
    const to = from + width;
    return { from, to, mid: from + width / 2, count: 0, normal: s > 0 ? xs.length * (normalCdf((to - m) / s) - normalCdf((from - m) / s)) : 0 };
  });
  for (const x of xs) out[Math.max(0, Math.min(bins - 1, Math.floor((x - lo) / width)))].count += 1;
  return out;
}

/* ---------------------------------------------------------------- simulation */

/**
 * Filtered historical simulation: returns are scaled by their volatility at the
 * time (EWMA), then replayed at today's volatility with the drift removed, so the
 * range reflects the current regime and makes no directional forecast.
 */
export function simulateRange(
  returns: readonly number[],
  horizon: number,
  { paths = 1000, seed = 42, lambda = 0.94 }: { paths?: number; seed?: number; lambda?: number } = {},
): number[][] {
  const m = mean(returns);
  const de = returns.map((r) => r - m);
  let variance = mean(de.slice(0, 30).map((r) => r * r)) || 1e-8;
  const shocks: number[] = [];
  for (const r of de) {
    shocks.push(r / Math.sqrt(variance));
    variance = lambda * variance + (1 - lambda) * r * r;
  }
  const zm = mean(shocks);
  const z = shocks.map((s) => s - zm);
  const rng = new Rng(seed);
  const results: number[][] = Array.from({ length: horizon + 1 }, () => []);
  for (let p = 0; p < paths; p++) {
    let v = variance;
    let cum = 0;
    results[0].push(0);
    for (let h = 1; h <= horizon; h++) {
      const r = z[rng.int(0, z.length - 1)] * Math.sqrt(v);
      cum += r;
      v = lambda * v + (1 - lambda) * r * r;
      results[h].push(cum);
    }
  }
  return results;
}

/**
 * How often would the simulated 90% band have contained what actually happened?
 * Each check uses only data available at that time.
 */
export function rangeCoverage(returns: readonly number[], horizon: number, { step = 7, minHistory = 180, paths = 200 } = {}): { checks: number; inside: number; rate: number } {
  let checks = 0;
  let inside = 0;
  for (let t = minHistory; t + horizon <= returns.length; t += step) {
    const final = simulateRange(returns.slice(0, t), horizon, { paths, seed: 1000 + t })[horizon].sort((a, b) => a - b);
    let realised = 0;
    for (let i = t; i < t + horizon; i++) realised += returns[i];
    checks += 1;
    if (realised >= quantile(final, 0.05) && realised <= quantile(final, 0.95)) inside += 1;
  }
  return { checks, inside, rate: checks ? inside / checks : NaN };
}
