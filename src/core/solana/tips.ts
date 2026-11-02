/**
 * Jito bundle-tip forecasting.
 *
 * A searcher attaching a tip to a Jito bundle faces a simple trade-off: tip too
 * little and the bundle loses the auction; tip too much and the edge is paid
 * away to the validator. Jito publishes the *landed* tip distribution (25th…99th
 * percentile) — this module turns that into a forward-looking recommendation:
 *
 *   "What tip outbids k% of the bundles that will land next hour, with
 *    confidence c?"
 *
 * Method — Mondrian split-conformal quantile forecasting:
 *   1. Anchor:   an EMA of log(p_k) up to hour t (the current "fair" level).
 *   2. Residual: r = log(p_k[t+1]) − anchor[t], the multiplicative surprise.
 *   3. Regime:   congestion = log(p50[t]) − log(EMA p50[t]), bucketed into
 *                calm / normal / hot by terciles of the calibration window.
 *   4. Forecast: tip = exp(anchor + Q_c(residuals | regime)).
 *
 * Conformal calibration gives a distribution-free coverage guarantee under
 * exchangeability; conditioning on regime (Mondrian) keeps coverage honest
 * during congestion spikes, where a single global quantile under-covers. The
 * walk-forward evaluation below measures realised coverage out of sample, so
 * the claim is checked rather than asserted.
 *
 * The bundled history is synthetic (seeded, shaped on the live Jito tip-floor
 * API's percentile spreads). When a live snapshot is supplied, the anchor comes
 * from mainnet and only the residual quantiles come from the bundled history.
 */

import { Rng } from "@/core/ml/rng";
import { hashValue } from "@/core/hash";

export const LAMPORTS_PER_SOL = 1_000_000_000;
/** Jito's block engine rejects tips below 1,000 lamports. */
export const MIN_TIP_LAMPORTS = 1_000;

export const TIP_LEVELS = [25, 50, 75, 95, 99] as const;
export type TipLevel = (typeof TIP_LEVELS)[number];

export type Regime = "calm" | "normal" | "hot";

/** One hour of the landed-tip distribution, in SOL. */
export interface TipBar {
  t: number;
  p25: number;
  p50: number;
  p75: number;
  p95: number;
  p99: number;
}

/** Shape of a live Jito tip-floor snapshot (bundles.jito.wtf). */
export interface TipFloorSnapshot {
  time: string;
  p25: number;
  p50: number;
  p75: number;
  p95: number;
  p99: number;
  emaP50: number;
}

const HOUR_MS = 3_600_000;
const GENESIS = Date.UTC(2026, 6, 1, 0, 0, 0);
const HISTORY_SEED = 20260701;
const HISTORY_HOURS = 24 * 120;

/** log10 spreads of each percentile over p50, matched to the live API. */
const SPREAD: Record<TipLevel, number> = { 25: -0.31, 50: 0, 75: 0.7, 95: 1.6, 99: 2.7 };

export function levelValue(bar: TipBar | TipFloorSnapshot, level: TipLevel): number {
  return bar[`p${level}` as const];
}

/* --------------------------------------------------------------- history */

/**
 * Seeded synthetic tip history. Features a diurnal cycle (US/Asia overlap),
 * an AR(1) congestion process, and occasional launch-driven spikes that decay
 * over a few hours — the regimes in which naive tipping fails.
 */
export function generateTipHistory(hours = HISTORY_HOURS, seed = HISTORY_SEED): TipBar[] {
  const rng = new Rng(seed);
  const bars: TipBar[] = [];
  let congestion = 0;
  let spike = 0;
  const base = Math.log10(1e-5);

  for (let i = 0; i < hours; i++) {
    const hourOfDay = i % 24;
    const diurnal = 0.12 * Math.sin(((hourOfDay - 9) / 24) * 2 * Math.PI);
    congestion = 0.9 * congestion + 0.08 * rng.normal();
    if (rng.next() < 0.012) spike += rng.uniform(0.5, 1.4);
    spike *= 0.72;
    const noise = 0.06 * rng.normal();
    const logP50 = base + diurnal + congestion + spike + noise;
    // Tails fatten when the network is hot.
    const heat = Math.max(0, congestion + spike);
    const level = (lv: TipLevel) => {
      const spread = SPREAD[lv] * (lv > 50 ? 1 + 0.35 * heat : 1);
      return round9(Math.pow(10, logP50 + spread + 0.03 * rng.normal()));
    };
    bars.push({
      t: GENESIS + i * HOUR_MS,
      p25: level(25),
      p50: round9(Math.pow(10, logP50)),
      p75: level(75),
      p95: level(95),
      p99: level(99),
    });
  }
  return bars;
}

function round9(x: number): number {
  return Math.round(x * 1e12) / 1e12;
}

/* -------------------------------------------------------------- features */

const ANCHOR_ALPHA = 0.3;
const CONGESTION_ALPHA = 0.08;

interface HourFeatures {
  anchor: Record<TipLevel, number>; // EMA of log(p_k)
  congestion: number; // log p50 − log EMA(p50)
}

function computeFeatures(bars: TipBar[]): HourFeatures[] {
  const out: HourFeatures[] = [];
  const ema = {} as Record<TipLevel, number>;
  let slowP50 = Math.log(bars[0].p50);
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    for (const lv of TIP_LEVELS) {
      const x = Math.log(levelValue(b, lv));
      ema[lv] = i === 0 ? x : ANCHOR_ALPHA * x + (1 - ANCHOR_ALPHA) * ema[lv];
    }
    const lp = Math.log(b.p50);
    slowP50 = CONGESTION_ALPHA * lp + (1 - CONGESTION_ALPHA) * slowP50;
    out.push({ anchor: { ...ema }, congestion: lp - slowP50 });
  }
  return out;
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  // Conformal finite-sample correction: ceil((n+1)q)/n.
  const n = sorted.length;
  const idx = Math.min(n - 1, Math.max(0, Math.ceil((n + 1) * q) - 1));
  return sorted[idx];
}

/* ------------------------------------------------------------ calibration */

export interface Calibration {
  thresholds: [number, number]; // congestion terciles
  residuals: Record<TipLevel, Record<Regime | "all", number[]>>; // sorted
  n: number;
}

function regimeOf(congestion: number, thresholds: [number, number]): Regime {
  if (congestion <= thresholds[0]) return "calm";
  if (congestion >= thresholds[1]) return "hot";
  return "normal";
}

function calibrate(bars: TipBar[], feats: HourFeatures[], from: number, to: number): Calibration {
  const cong = feats.slice(from, to).map((f) => f.congestion).sort((a, b) => a - b);
  const thresholds: [number, number] = [quantile(cong, 1 / 3), quantile(cong, 2 / 3)];
  const residuals = {} as Calibration["residuals"];
  for (const lv of TIP_LEVELS) {
    residuals[lv] = { calm: [], normal: [], hot: [], all: [] };
  }
  for (let i = from; i < to - 1; i++) {
    const regime = regimeOf(feats[i].congestion, thresholds);
    for (const lv of TIP_LEVELS) {
      const r = Math.log(levelValue(bars[i + 1], lv)) - feats[i].anchor[lv];
      residuals[lv][regime].push(r);
      residuals[lv].all.push(r);
    }
  }
  for (const lv of TIP_LEVELS) {
    for (const k of ["calm", "normal", "hot", "all"] as const) residuals[lv][k].sort((a, b) => a - b);
  }
  return { thresholds, residuals, n: to - from };
}

function forecastLog(
  cal: Calibration,
  anchor: number,
  congestion: number,
  level: TipLevel,
  confidence: number,
  mondrian = true,
): { logTip: number; regime: Regime } {
  const regime = regimeOf(congestion, cal.thresholds);
  const pool = mondrian && cal.residuals[level][regime].length >= 30 ? cal.residuals[level][regime] : cal.residuals[level].all;
  return { logTip: anchor + quantile(pool, confidence), regime };
}

/* ------------------------------------------------------------- evaluation */

export interface CoverageRow {
  level: TipLevel;
  confidence: number;
  /** Realised share of hours where the tip ≥ next hour's p_k (target = confidence). */
  coverage: number;
  /** Same for a global (non-regime) conformal quantile — the ablation. */
  coverageGlobal: number;
  /** Same for the naive "tip last hour's p_k" rule. */
  coverageNaive: number;
  /** Coverage in hot-regime hours only, Mondrian vs global. */
  coverageHot: number;
  coverageHotGlobal: number;
  /** Median of recommended / realised — the price of the guarantee. */
  medianOverpay: number;
  tested: number;
}

export interface AdvisorBacktest {
  folds: number;
  rows: CoverageRow[];
  historyHash: string;
  hours: number;
}

export const EVAL_CONFIDENCES = [0.5, 0.8, 0.95] as const;

/** Expanding-window walk-forward: calibrate on the past, test on the next fold. */
export function backtestAdvisor(bars: TipBar[], folds = 4): AdvisorBacktest {
  const feats = computeFeatures(bars);
  const warmup = Math.floor(bars.length * 0.3);
  const foldSize = Math.floor((bars.length - warmup) / folds);
  const rows: CoverageRow[] = [];

  const cals: Calibration[] = [];
  for (let f = 0; f < folds; f++) cals.push(calibrate(bars, feats, 0, warmup + f * foldSize));

  for (const level of TIP_LEVELS) {
    for (const confidence of EVAL_CONFIDENCES) {
      let hit = 0, hitG = 0, hitN = 0, n = 0, hot = 0, hotHit = 0, hotHitG = 0;
      const overpay: number[] = [];
      for (let f = 0; f < folds; f++) {
        const cal = cals[f];
        const start = warmup + f * foldSize;
        const end = f === folds - 1 ? bars.length - 1 : start + foldSize;
        for (let i = start; i < end; i++) {
          const realised = Math.log(levelValue(bars[i + 1], level));
          const m = forecastLog(cal, feats[i].anchor[level], feats[i].congestion, level, confidence, true);
          const g = forecastLog(cal, feats[i].anchor[level], feats[i].congestion, level, confidence, false);
          const naive = Math.log(levelValue(bars[i], level));
          n++;
          if (m.logTip >= realised) hit++;
          if (g.logTip >= realised) hitG++;
          if (naive >= realised) hitN++;
          if (m.regime === "hot") {
            hot++;
            if (m.logTip >= realised) hotHit++;
            if (g.logTip >= realised) hotHitG++;
          }
          overpay.push(Math.exp(m.logTip - realised));
        }
      }
      overpay.sort((a, b) => a - b);
      rows.push({
        level,
        confidence,
        coverage: hit / n,
        coverageGlobal: hitG / n,
        coverageNaive: hitN / n,
        coverageHot: hot ? hotHit / hot : 0,
        coverageHotGlobal: hot ? hotHitG / hot : 0,
        medianOverpay: overpay[Math.floor(overpay.length / 2)],
        tested: n,
      });
    }
  }
  return { folds, rows, historyHash: hashValue(bars).slice(0, 12), hours: bars.length };
}

/* --------------------------------------------------------- recommendation */

export interface TipRecommendation {
  level: TipLevel;
  confidence: number;
  tipSol: number;
  tipLamports: number;
  regime: Regime;
  anchorSol: number;
  /** Where the anchor came from. */
  anchorSource: "live" | "bundled-history";
  calibrationHours: number;
  /** The same recommendation without regime conditioning (for comparison). */
  globalTipSol: number;
}

export interface TipAdvisor {
  history: TipBar[];
  backtest: AdvisorBacktest;
  recommend(level: TipLevel, confidence: number, live?: TipFloorSnapshot | null): TipRecommendation;
}

let cached: TipAdvisor | null = null;

/** Build (once) the advisor over the bundled history, calibrated on all of it. */
export function getTipAdvisor(): TipAdvisor {
  if (cached) return cached;
  const history = generateTipHistory();
  const feats = computeFeatures(history);
  const cal = calibrate(history, feats, 0, history.length);
  const backtest = backtestAdvisor(history);
  const last = feats[feats.length - 1];

  cached = {
    history,
    backtest,
    recommend(level, confidence, live) {
      const c = Math.min(0.99, Math.max(0.05, confidence));
      let anchor = last.anchor[level];
      let congestion = last.congestion;
      let anchorSource: TipRecommendation["anchorSource"] = "bundled-history";
      if (live && levelValue(live, level) > 0 && live.p50 > 0 && live.emaP50 > 0) {
        anchor = Math.log(levelValue(live, level));
        congestion = Math.log(live.p50) - Math.log(live.emaP50);
        anchorSource = "live";
      }
      const m = forecastLog(cal, anchor, congestion, level, c, true);
      const g = forecastLog(cal, anchor, congestion, level, c, false);
      const tipSol = Math.max(Math.exp(m.logTip), MIN_TIP_LAMPORTS / LAMPORTS_PER_SOL);
      return {
        level,
        confidence: c,
        tipSol,
        tipLamports: Math.round(tipSol * LAMPORTS_PER_SOL),
        regime: m.regime,
        anchorSol: Math.exp(anchor),
        anchorSource,
        calibrationHours: cal.n,
        globalTipSol: Math.max(Math.exp(g.logTip), MIN_TIP_LAMPORTS / LAMPORTS_PER_SOL),
      };
    },
  };
  return cached;
}
