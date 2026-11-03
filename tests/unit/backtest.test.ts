import { describe, expect, it } from "vitest";
import { DEFAULT_COST_CONFIG, DEFAULT_STRATEGY_CONFIG, runBacktest, type BacktestPoint } from "@/core/backtest/engine";
import { Rng } from "@/core/ml/rng";
import { acceptanceCriteria, modelStatus } from "@/core/experiments/lifecycle";
import { getSeedResults } from "@/core/experiments/seed";

const HOUR = 3_600_000;

/** i.i.d. returns with a "perfect foresight" signal that peeks at the same bar's return. */
function peekingSeries(n: number): BacktestPoint[] {
  const rng = new Rng(11);
  return Array.from({ length: n }, (_, i) => {
    const r = rng.normal(0, 0.01);
    return { t: i * HOUR, forwardReturn: r, proba: r > 0 ? 0.95 : 0.05 };
  });
}

describe("backtest execution realism", () => {
  it("never fills a signal on the bar it was computed from", () => {
    const pts = peekingSeries(3000);
    const sameBar = runBacktest(pts, { ...DEFAULT_STRATEGY_CONFIG, executionLag: 0 }, { costBps: 0, slippageBps: 0 });
    const nextBar = runBacktest(pts, DEFAULT_STRATEGY_CONFIG, { costBps: 0, slippageBps: 0 });
    // Same-bar execution turns look-ahead into an absurd Sharpe; next-bar removes it.
    expect(sameBar.sharpe).toBeGreaterThan(20);
    expect(Math.abs(nextBar.sharpe)).toBeLessThan(3 * nextBar.sharpeStdErr);
    expect(nextBar.executionLag).toBe(1);
    expect(nextBar.equityCurve[0].position).toBe(0);
  });

  it("flattens positions across gaps between folds", () => {
    const pts = peekingSeries(200).map((p, i) => (i >= 100 ? { ...p, t: p.t + 50 * HOUR } : p));
    const bt = runBacktest(pts, DEFAULT_STRATEGY_CONFIG, { costBps: 0, slippageBps: 0 });
    expect(bt.equityCurve[100].position).toBe(0);
  });

  it("charges every cost component and reports annualisation and uncertainty", () => {
    const bt = runBacktest(peekingSeries(2000), DEFAULT_STRATEGY_CONFIG, DEFAULT_COST_CONFIG);
    const c = bt.costBreakdownBps;
    for (const v of [c.fees, c.spread, c.slippage, c.impact, c.borrow]) expect(v).toBeGreaterThan(0);
    expect(bt.periodsPerYear).toBe(8766);
    expect(bt.sharpeStdErr).toBeGreaterThan(0);
    expect(bt.trades).toBeGreaterThan(0);
  });
});

describe("model lifecycle", () => {
  it("derives one consistent status per model from explicit criteria", async () => {
    const results = await getSeedResults();
    for (const r of results) {
      for (const m of r.record.models) {
        const s = modelStatus(r.record, m);
        if (m.modelId !== r.record.bestModelId) expect(s).toBe("evaluated");
        else expect(s).toBe(acceptanceCriteria(r.record, m).every((c) => c.passed) ? "approved" : "rejected");
      }
    }
  }, 60_000);
});
