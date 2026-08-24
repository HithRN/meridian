/**
 * Event-driven backtest engine (deterministic, cost-aware).
 *
 * Converts a model's per-bar probability into a position, walks the series
 * forward one bar at a time, and books the realised forward return net of
 * transaction costs charged on position changes (turnover). Nothing here can
 * see the future: the position for bar `i` is decided from the prediction at
 * bar `i` and earns the return realised *after* `i`.
 *
 * Reported metrics (Sharpe, max drawdown, turnover, total cost) are the
 * authoritative trading numbers; agents may not restate trading performance
 * from any other source.
 */

import { std, mean } from "@/core/ml/stats";

export interface BacktestPoint {
  proba: number;
  /** Realised forward *log* return earned by a unit long position at this bar. */
  forwardReturn: number;
  t: number;
}

export interface StrategyConfig {
  /**
   * Dead-band around 0.5. Position engages only when |proba-0.5| exceeds this,
   * discouraging churn on weak signals.
   */
  band: number;
  /** Allow short positions when the signal is bearish. */
  allowShort: boolean;
  /** Maximum absolute position size (leverage cap). */
  maxPosition: number;
  /** "binary" (±maxPosition / 0) or "proportional" to signal strength. */
  sizing: "binary" | "proportional";
}

export interface CostConfig {
  /** Round-trip-agnostic cost per unit turnover, in basis points. */
  costBps: number;
  /** Fixed slippage added per unit turnover, in basis points. */
  slippageBps: number;
}

export const DEFAULT_STRATEGY_CONFIG: StrategyConfig = {
  band: 0.02,
  allowShort: true,
  maxPosition: 1,
  sizing: "proportional",
};

export const DEFAULT_COST_CONFIG: CostConfig = {
  costBps: 5,
  slippageBps: 2,
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

export interface BacktestResult {
  periods: number;
  periodsPerYear: number;
  /** Compounded net return over the whole test period. */
  totalReturn: number;
  annualisedReturn: number;
  annualisedVolatility: number;
  sharpe: number;
  sortino: number;
  maxDrawdown: number;
  turnover: number;
  averageTurnover: number;
  totalCostBps: number;
  hitRate: number;
  exposure: number;
  /** Buy-and-hold benchmark total return over the same window. */
  benchmarkReturn: number;
  equityCurve: EquityPoint[];
}

function signalToPosition(proba: number, cfg: StrategyConfig): number {
  const edge = proba - 0.5;
  if (Math.abs(edge) < cfg.band) return 0;
  const raw =
    cfg.sizing === "binary"
      ? Math.sign(edge) * cfg.maxPosition
      : clamp(edge * 2, -1, 1) * cfg.maxPosition;
  if (!cfg.allowShort && raw < 0) return 0;
  return raw;
}

export function runBacktest(
  points: BacktestPoint[],
  strategy: StrategyConfig,
  cost: CostConfig,
  periodsPerYear = 24 * 252,
): BacktestResult {
  const n = points.length;
  const curve: EquityPoint[] = [];
  const netReturns: number[] = [];
  const costRate = (cost.costBps + cost.slippageBps) / 10_000;

  let prevPosition = 0;
  let equity = 1;
  let peak = 1;
  let maxDd = 0;
  let totalTurnover = 0;
  let totalCost = 0;
  let activeBars = 0;
  let wins = 0;
  let benchmark = 1;

  for (let i = 0; i < n; i++) {
    const p = points[i];
    const position = signalToPosition(p.proba, strategy);
    const simpleRet = Math.exp(p.forwardReturn) - 1;

    const turnover = Math.abs(position - prevPosition);
    const barCost = turnover * costRate;
    const gross = position * simpleRet;
    const net = gross - barCost;

    equity *= 1 + net;
    benchmark *= 1 + simpleRet;
    peak = Math.max(peak, equity);
    const dd = peak > 0 ? equity / peak - 1 : 0;
    maxDd = Math.min(maxDd, dd);

    totalTurnover += turnover;
    totalCost += barCost;
    if (position !== 0) {
      activeBars++;
      if (net > 0) wins++;
    }
    netReturns.push(net);

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

  return {
    periods: n,
    periodsPerYear,
    totalReturn: round6(equity - 1),
    annualisedReturn: round6(annReturn),
    annualisedVolatility: round6(annVol),
    sharpe: round4(sigma > 0 ? (mu / sigma) * Math.sqrt(periodsPerYear) : 0),
    sortino: round4(downside > 0 ? (mu / downside) * Math.sqrt(periodsPerYear) : 0),
    maxDrawdown: round6(maxDd),
    turnover: round4(totalTurnover),
    averageTurnover: round6(n ? totalTurnover / n : 0),
    totalCostBps: round4(totalCost * 10_000),
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
