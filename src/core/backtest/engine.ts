/**
 * Event-driven backtest engine (deterministic, cost-aware).
 *
 * Execution model: a model's prediction at bar T (computed from data up to
 * T's close) sets a *target* position that is executed at the next bar,
 * T + executionLag, and then earns that bar's forward return. Signals are never
 * filled at the same price used to compute them. Where the out-of-sample stream
 * has a time gap (between walk-forward folds) the position is flattened rather
 * than carried across unseen data.
 *
 * Cost model, charged per unit of turnover |Δposition| (fractions of notional):
 *   fees        costBps                                        (commission/exchange)
 *   spread      slippageBps                                    (half-spread crossed)
 *   slippage    volSlippage × σ̂                                (volatility-scaled)
 *   impact      impactCoef × σ̂ × √|Δposition|                  (square-root law)
 *   borrow      borrowBpsAnnual / periodsPerYear × |short pos|  (per bar held short)
 * where σ̂ is the trailing standard deviation of realised bar returns.
 *
 * Reported metrics include trade counts, the annualisation convention and a
 * Sharpe standard error (Lo, 2002), so a reader can judge the headline number.
 */

import { std, mean } from "@/core/ml/stats";

export interface BacktestPoint {
  proba: number;
  /** Realised forward *log* return earned by a unit long position at this bar. */
  forwardReturn: number;
  t: number;
}

export interface StrategyConfig {
  /** Dead-band around 0.5; the position engages only when |proba − 0.5| exceeds it. */
  band: number;
  allowShort: boolean;
  /** Maximum absolute position size (leverage cap). */
  maxPosition: number;
  sizing: "binary" | "proportional";
  /** Bars between signal and execution (≥ 1 means no same-bar fills). */
  executionLag?: number;
}

export interface CostConfig {
  /** Fees and commissions per unit turnover, bps. */
  costBps: number;
  /** Half-spread crossed per unit turnover, bps. */
  slippageBps: number;
  /** Slippage as a multiple of trailing bar volatility, per unit turnover. */
  volSlippage?: number;
  /** Square-root market-impact coefficient (× σ̂ × √turnover). */
  impactCoef?: number;
  /** Annual borrow fee on short notional, bps. */
  borrowBpsAnnual?: number;
}

export const DEFAULT_STRATEGY_CONFIG: StrategyConfig = {
  band: 0.02,
  allowShort: true,
  maxPosition: 1,
  sizing: "proportional",
  executionLag: 1,
};

export const DEFAULT_COST_CONFIG: CostConfig = {
  costBps: 5,
  slippageBps: 2,
  volSlippage: 0.1,
  impactCoef: 0.1,
  borrowBpsAnnual: 100,
};

export interface EquityPoint {
  t: number;
  position: number;
  grossReturn: number;
  cost: number;
  netReturn: number;
  equity: number;
  drawdown: number;
}

export interface CostBreakdown {
  fees: number;
  spread: number;
  slippage: number;
  impact: number;
  borrow: number;
}

export interface BacktestResult {
  periods: number;
  periodsPerYear: number;
  executionLag: number;
  totalReturn: number;
  annualisedReturn: number;
  annualisedVolatility: number;
  sharpe: number;
  /** Standard error of the annualised Sharpe ratio (Lo, 2002, i.i.d.). */
  sharpeStdErr: number;
  sortino: number;
  maxDrawdown: number;
  turnover: number;
  averageTurnover: number;
  /** Bars on which the position changed. */
  trades: number;
  totalCostBps: number;
  /** Total cost by component, in bps of starting notional. */
  costBreakdownBps: CostBreakdown;
  hitRate: number;
  exposure: number;
  /** Buy-and-hold benchmark total return over the same window. */
  benchmarkReturn: number;
  equityCurve: EquityPoint[];
}

const YEAR_MS = 365.25 * 24 * 3_600_000;

/** Annualisation from the median bar spacing (24/7 series ⇒ 8,766 hourly bars a year). */
export function inferPeriodsPerYear(points: BacktestPoint[], fallback = 24 * 365.25): number {
  if (points.length < 3) return fallback;
  const gaps: number[] = [];
  for (let i = 1; i < points.length; i++) gaps.push(points[i].t - points[i - 1].t);
  gaps.sort((a, b) => a - b);
  const median = gaps[Math.floor(gaps.length / 2)];
  return median > 0 ? YEAR_MS / median : fallback;
}

function signalToPosition(proba: number, cfg: StrategyConfig): number {
  const edge = proba - 0.5;
  if (Math.abs(edge) < cfg.band) return 0;
  const raw =
    cfg.sizing === "binary" ? Math.sign(edge) * cfg.maxPosition : clamp(edge * 2, -1, 1) * cfg.maxPosition;
  if (!cfg.allowShort && raw < 0) return 0;
  return raw;
}

const VOL_WINDOW = 48;

export function runBacktest(
  points: BacktestPoint[],
  strategy: StrategyConfig,
  cost: CostConfig,
  periodsPerYear = inferPeriodsPerYear(points),
): BacktestResult {
  const n = points.length;
  const lag = Math.max(0, Math.round(strategy.executionLag ?? DEFAULT_STRATEGY_CONFIG.executionLag!));
  const fees = cost.costBps / 10_000;
  const spread = cost.slippageBps / 10_000;
  const volSlip = cost.volSlippage ?? 0;
  const impactK = cost.impactCoef ?? 0;
  const borrowPerBar = (cost.borrowBpsAnnual ?? 0) / 10_000 / periodsPerYear;

  // Expected spacing, used to detect gaps between folds.
  const spacing = n > 1 ? YEAR_MS / periodsPerYear : 0;

  const curve: EquityPoint[] = [];
  const netReturns: number[] = [];
  const realised: number[] = [];
  const breakdown: CostBreakdown = { fees: 0, spread: 0, slippage: 0, impact: 0, borrow: 0 };

  let prevPosition = 0;
  let equity = 1;
  let peak = 1;
  let maxDd = 0;
  let totalTurnover = 0;
  let totalCost = 0;
  let activeBars = 0;
  let wins = 0;
  let trades = 0;
  let benchmark = 1;

  for (let i = 0; i < n; i++) {
    const p = points[i];
    // Target from the signal `lag` bars earlier, only if no gap in between.
    let position = 0;
    const j = i - lag;
    if (j >= 0) {
      const contiguous = lag === 0 || Math.abs(p.t - points[j].t - lag * spacing) <= spacing * 0.5;
      if (contiguous) position = signalToPosition(points[j].proba, strategy);
    }

    const recent = realised.slice(-VOL_WINDOW);
    const sigma = recent.length >= 8 ? std(recent, true) : 0.005;
    const simpleRet = Math.exp(p.forwardReturn) - 1;

    const turnover = Math.abs(position - prevPosition);
    const cFees = turnover * fees;
    const cSpread = turnover * spread;
    const cSlip = turnover * volSlip * sigma;
    const cImpact = impactK * sigma * Math.pow(turnover, 1.5);
    const cBorrow = position < 0 ? -position * borrowPerBar : 0;
    const barCost = cFees + cSpread + cSlip + cImpact + cBorrow;
    breakdown.fees += cFees;
    breakdown.spread += cSpread;
    breakdown.slippage += cSlip;
    breakdown.impact += cImpact;
    breakdown.borrow += cBorrow;

    const gross = position * simpleRet;
    const net = gross - barCost;

    equity *= 1 + net;
    benchmark *= 1 + simpleRet;
    peak = Math.max(peak, equity);
    const dd = peak > 0 ? equity / peak - 1 : 0;
    maxDd = Math.min(maxDd, dd);

    totalTurnover += turnover;
    totalCost += barCost;
    if (turnover > 1e-9) trades++;
    if (position !== 0) {
      activeBars++;
      if (net > 0) wins++;
    }
    netReturns.push(net);
    realised.push(simpleRet);

    curve.push({
      t: p.t,
      position: round6(position),
      grossReturn: round6(gross),
      cost: round6(barCost),
      netReturn: round6(net),
      equity: round6(equity),
      drawdown: round6(dd),
    });

    prevPosition = position;
  }

  const mu = mean(netReturns);
  const sigma = std(netReturns, true);
  const downside = std(
    netReturns.filter((r) => r < 0),
    true,
  );
  const annReturn = Math.pow(1 + mu, periodsPerYear) - 1;
  const annVol = sigma * Math.sqrt(periodsPerYear);
  const srPer = sigma > 0 ? mu / sigma : 0;
  const seAnn = n > 1 ? Math.sqrt((1 + 0.5 * srPer * srPer) / n) * Math.sqrt(periodsPerYear) : 0;
  const bps = (x: number) => round4(x * 10_000);

  return {
    periods: n,
    periodsPerYear: Math.round(periodsPerYear),
    executionLag: lag,
    totalReturn: round6(equity - 1),
    annualisedReturn: round6(annReturn),
    annualisedVolatility: round6(annVol),
    sharpe: round4(srPer * Math.sqrt(periodsPerYear)),
    sharpeStdErr: round4(seAnn),
    sortino: round4(downside > 0 ? (mu / downside) * Math.sqrt(periodsPerYear) : 0),
    maxDrawdown: round6(maxDd),
    turnover: round4(totalTurnover),
    averageTurnover: round6(n ? totalTurnover / n : 0),
    trades,
    totalCostBps: bps(totalCost),
    costBreakdownBps: {
      fees: bps(breakdown.fees),
      spread: bps(breakdown.spread),
      slippage: bps(breakdown.slippage),
      impact: bps(breakdown.impact),
      borrow: bps(breakdown.borrow),
    },
    hitRate: round4(activeBars ? wins / activeBars : 0),
    exposure: round4(n ? activeBars / n : 0),
    benchmarkReturn: round6(benchmark - 1),
    equityCurve: curve,
  };
}

function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}
function round4(x: number): number {
  return Math.round(x * 1e4) / 1e4;
}
function round6(x: number): number {
  return Math.round(x * 1e6) / 1e6;
}
