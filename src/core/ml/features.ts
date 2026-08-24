/**
 * Leakage-safe feature engineering for time-series bars.
 *
 * The cardinal rule enforced here: a feature row at index `i` may only use
 * information available at the *close of bar i*. The prediction target is the
 * forward return over the next `horizon` bars, so no feature may peek at
 * bar `i+1` or later. Every builder in this module respects that boundary; the
 * `create_features` tool additionally records the horizon so downstream splits
 * can purge the boundary between train and test windows.
 */

import type { OhlcvBar } from "@/core/data/dataset";
import { mean, std } from "@/core/ml/stats";

export interface FeatureConfig {
  /** Momentum lookback in bars (e.g. 20-period momentum). */
  momentumPeriod: number;
  /** Windows over which to compute realised volatility. */
  volatilityWindow: number;
  /** RSI lookback. */
  rsiPeriod: number;
  /** Forward-return horizon (in bars) used to build the label. */
  horizon: number;
  /**
   * Classification threshold on the forward return. Label = 1 when the forward
   * return exceeds this value (accounts for a minimal edge), else 0.
   */
  labelThreshold: number;
}

export const DEFAULT_FEATURE_CONFIG: FeatureConfig = {
  momentumPeriod: 20,
  volatilityWindow: 20,
  rsiPeriod: 14,
  horizon: 1,
  labelThreshold: 0,
};

export interface FeatureRow {
  /** Index into the source bar array (close of this bar = decision time). */
  barIndex: number;
  t: number;
  features: number[];
  /** Forward return over the configured horizon (target for regression). */
  forwardReturn: number;
  /** Binary label derived from the forward return (target for classification). */
  label: number;
}

export interface FeatureSet {
  featureNames: string[];
  config: FeatureConfig;
  rows: FeatureRow[];
}

const EPS = 1e-9;

function logReturns(bars: OhlcvBar[]): number[] {
  const r = new Array(bars.length).fill(0);
  for (let i = 1; i < bars.length; i++) {
    r[i] = Math.log((bars[i].close + EPS) / (bars[i - 1].close + EPS));
  }
  return r;
}

function rsi(bars: OhlcvBar[], period: number, at: number): number {
  if (at < period) return 50;
  let gains = 0;
  let losses = 0;
  for (let i = at - period + 1; i <= at; i++) {
    const change = bars[i].close - bars[i - 1].close;
    if (change >= 0) gains += change;
    else losses -= change;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss < EPS) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/**
 * Build a leakage-safe feature set. Rows are only emitted where every lookback
 * window is fully populated AND the forward horizon exists, so there are no
 * partial or future-dependent rows.
 */
export function buildFeatures(
  bars: OhlcvBar[],
  config: FeatureConfig,
): FeatureSet {
  const logRet = logReturns(bars);
  const featureNames = [
    `momentum_${config.momentumPeriod}`,
    `return_1`,
    `rsi_${config.rsiPeriod}`,
    `volatility_${config.volatilityWindow}`,
    `range_pct`,
    `volume_z_${config.volatilityWindow}`,
  ];

  const warmup = Math.max(
    config.momentumPeriod,
    config.volatilityWindow,
    config.rsiPeriod,
  );
  const rows: FeatureRow[] = [];

  // Stop early enough that the forward horizon is always available.
  const last = bars.length - config.horizon - 1;

  for (let i = warmup; i <= last; i++) {
    // --- All features use data at or before the close of bar i. ---
    const momentum = Math.log(
      (bars[i].close + EPS) / (bars[i - config.momentumPeriod].close + EPS),
    );
    const return1 = logRet[i];
    const rsiVal = rsi(bars, config.rsiPeriod, i) / 100;

    const volWindow = logRet.slice(i - config.volatilityWindow + 1, i + 1);
    const volatility = std(volWindow, true);

    const rangePct = (bars[i].high - bars[i].low) / (bars[i].close + EPS);

    const volWin = bars
      .slice(i - config.volatilityWindow + 1, i + 1)
      .map((b) => b.volume);
    const vMean = mean(volWin);
    const vStd = std(volWin, true) || 1;
    const volumeZ = (bars[i].volume - vMean) / vStd;

    // --- Target: forward return strictly in the future (i → i+horizon). ---
    const forwardReturn = Math.log(
      (bars[i + config.horizon].close + EPS) / (bars[i].close + EPS),
    );
    const label = forwardReturn > config.labelThreshold ? 1 : 0;

    rows.push({
      barIndex: i,
      t: bars[i].t,
      features: [momentum, return1, rsiVal, volatility, rangePct, volumeZ],
      forwardReturn,
      label,
    });
  }

  return { featureNames, config, rows };
}
