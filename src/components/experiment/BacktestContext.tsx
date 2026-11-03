import * as React from "react";
import type { ModelResult } from "@/core/schemas/experiment";
import { pct } from "@/lib/format";

/**
 * The context a quant reviewer needs before trusting a Sharpe ratio: sample,
 * annualisation, execution, costs, benchmark and uncertainty.
 */
export function BacktestContext({ model }: { model: ModelResult }) {
  const bt = model.backtest;
  if (!bt) return null;
  const se = bt.sharpeStdErr;
  const c = bt.costBreakdownBps;
  const rows: Array<[string, string]> = [
    ["Out-of-sample bars", `${(bt.periods ?? model.metrics.n).toLocaleString("en-US")} hourly`],
    ["Annualisation", bt.periodsPerYear ? `√${bt.periodsPerYear.toLocaleString("en-US")} periods/yr (24/7)` : "n/a"],
    ["Execution", bt.executionLag !== undefined ? `Signal at T, filled at T+${bt.executionLag}` : "Same-bar (legacy record)"],
    ["Trades", bt.trades !== undefined ? bt.trades.toLocaleString("en-US") : "n/a"],
    ["Turnover · exposure", `${bt.turnover.toFixed(1)} · ${pct(bt.exposure)}`],
    ["Net Sharpe 95% CI", se !== undefined ? `${(bt.sharpe - 1.96 * se).toFixed(2)} to ${(bt.sharpe + 1.96 * se).toFixed(2)}` : "n/a"],
    ["Return vs buy-and-hold", `${pct(bt.totalReturn)} vs ${pct(bt.benchmarkReturn)}`],
    ["Max drawdown", pct(bt.maxDrawdown)],
    ["Costs (bps)", c ? `fees ${c.fees.toFixed(0)} · spread ${c.spread.toFixed(0)} · slip ${c.slippage.toFixed(0)} · impact ${c.impact.toFixed(0)} · borrow ${c.borrow.toFixed(0)}` : `${bt.totalCostBps.toFixed(0)} total`],
  ];
  return (
    <div className="mt-5 rounded-lg border border-line bg-paper p-5">
      <div className="eyebrow">How to read these numbers</div>
      <dl className="mt-3 grid grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt className="text-[0.75rem] text-faint">{k}</dt>
            <dd className="tnum">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-[0.8rem] leading-relaxed text-faint">
        AUC measures ranking quality of the predictions; Sharpe measures the traded strategy after costs. With thousands of hourly bars, a
        small AUC edge can produce a large Sharpe that is still statistically fragile, so judge it by its interval. Not modelled: liquidity
        and participation limits, trading calendars, corporate actions, survivorship.
      </p>
    </div>
  );
}
