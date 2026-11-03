/**
 * Reporter agent — evidence report generation (§6, §15).
 *
 * Produces a concise Markdown report assembled *only* from recorded tool
 * outputs and the critic's findings. It never introduces a number that did not
 * come from a tool. Financial conclusions are stated conditionally on the
 * simulated dataset and assumptions, as required by the guardrails (§10).
 */

import type { ResearchPlan } from "@/core/orchestrator/types";
import type { ExperimentRecord } from "@/core/schemas/experiment";
import type { DatasetProfile } from "@/core/data/profile";

function pct(x: number): string {
  return `${(x * 100).toFixed(2)}%`;
}

export function buildReport(
  question: string,
  plan: ResearchPlan,
  record: ExperimentRecord,
  profile: DatasetProfile,
): string {
  const best = record.models.find((m) => m.modelId === record.bestModelId) ?? record.models[0];
  const baseline = record.models.find((m) => m.modelId === record.baselineModelId);
  const critique = record.critique;

  const lines: string[] = [];
  lines.push(`# Research Report`);
  lines.push("");
  lines.push(`**Question.** ${question}`);
  lines.push("");
  lines.push(`**Hypothesis.** ${plan.hypothesis}`);
  lines.push("");

  // Provenance.
  lines.push(`## Data & provenance`);
  lines.push("");
  lines.push(`- Dataset: \`${record.dataset.datasetId}@${record.dataset.version}\` (${record.dataset.rows} rows)`);
  lines.push(`- Content hash: \`${record.dataset.contentHash}\``);
  lines.push(`- Data integrity: ${profile.passed ? "passed all checks" : "**warnings present**"}`);
  lines.push(`- Seed: \`${record.seed}\` · Kernel: \`${record.versions.kernel}\` · Platform: \`${record.versions.platform}\``);
  lines.push("");
  if (profile.leakage.length > 0) {
    lines.push(`> Leakage scan: ${profile.leakage.length} finding(s). ` +
      profile.leakage.map((l) => `\`${l.feature}\` (${l.severity}, ρ=${l.correlationWithFuture})`).join(", ") + ".");
    lines.push("");
  }

  // Method.
  lines.push(`## Method`);
  lines.push("");
  lines.push(`- Features: ${record.models.length ? plan.featureConfig.momentumPeriod : 0}-period momentum plus return, RSI, realised volatility, range and volume z-score (leakage-safe, horizon ${plan.featureConfig.horizon}).`);
  lines.push(`- Validation: ${plan.windowConfig.folds}-fold ${plan.windowConfig.mode} walk-forward, embargo ${plan.windowConfig.embargo}.`);
  lines.push(`- Execution: signals computed at bar T's close are executed at bar T+${plan.strategyConfig.executionLag ?? 1}; positions are flattened across gaps between folds.`);
  lines.push(
    `- Costs: ${
      plan.includeCosts
        ? `${plan.costConfig.costBps}bps fees + ${plan.costConfig.slippageBps}bps half-spread per unit turnover, volatility-scaled slippage (${plan.costConfig.volSlippage ?? 0}×σ), square-root impact (${plan.costConfig.impactCoef ?? 0}×σ×√turnover) and ${plan.costConfig.borrowBpsAnnual ?? 0}bps/yr borrow on shorts`
        : "gross (no costs applied)"
    }.`,
  );
  lines.push(`- Not modelled: liquidity and volume-participation limits, trading calendars, corporate actions, survivorship. Data is synthetic.`);
  lines.push("");

  // Results table.
  lines.push(`## Experiments`);
  lines.push("");
  lines.push(`| Model | AUC | Accuracy | IC | Sharpe (net) | Max DD |`);
  lines.push(`| --- | --- | --- | --- | --- | --- |`);
  for (const m of record.models) {
    const bt = m.backtest;
    const star = m.modelId === record.bestModelId ? " ⭐" : "";
    lines.push(
      `| ${m.modelType}${star} | ${m.metrics.auc.toFixed(3)} | ${m.metrics.accuracy.toFixed(3)} | ${m.metrics.informationCoefficient.toFixed(4)} | ${bt ? bt.sharpe.toFixed(2) : "—"} | ${bt ? pct(bt.maxDrawdown) : "—"} |`,
    );
  }
  lines.push("");

  // Best model detail.
  if (best?.backtest) {
    lines.push(`## Best model — ${best.modelType}`);
    lines.push("");
    lines.push(`- Out-of-sample AUC ${best.metrics.auc.toFixed(3)}, accuracy ${best.metrics.accuracy.toFixed(3)} vs base rate ${best.metrics.baseRate.toFixed(3)}.`);
    lines.push(`- Information coefficient ${best.metrics.informationCoefficient.toFixed(4)} over ${best.metrics.n} observations.`);
    lines.push(`- Backtest: total return ${pct(best.backtest.totalReturn)} (buy-and-hold ${pct(best.backtest.benchmarkReturn)}), net Sharpe ${best.backtest.sharpe.toFixed(2)}${best.backtest.sharpeStdErr !== undefined ? ` ± ${best.backtest.sharpeStdErr.toFixed(2)} (Lo 2002 SE; 95% CI ${(best.backtest.sharpe - 1.96 * best.backtest.sharpeStdErr).toFixed(2)} to ${(best.backtest.sharpe + 1.96 * best.backtest.sharpeStdErr).toFixed(2)})` : ""}, max drawdown ${pct(best.backtest.maxDrawdown)}, ${best.backtest.trades ?? "—"} trades, turnover ${best.backtest.turnover.toFixed(1)}, exposure ${pct(best.backtest.exposure)}.`);
    if (best.backtest.periodsPerYear) {
      lines.push(`- Annualisation: ${best.backtest.periods ?? best.metrics.n} hourly out-of-sample bars, √${best.backtest.periodsPerYear} periods per year (24/7 series).`);
    }
    if (best.backtest.costBreakdownBps) {
      const c = best.backtest.costBreakdownBps;
      lines.push(`- Cost breakdown (bps of starting notional): fees ${c.fees.toFixed(0)}, spread ${c.spread.toFixed(0)}, slippage ${c.slippage.toFixed(0)}, impact ${c.impact.toFixed(0)}, borrow ${c.borrow.toFixed(0)}.`);
    }
    if (baseline) {
      lines.push(`- Baseline (${baseline.modelType}) AUC ${baseline.metrics.auc.toFixed(3)} — lift of ${(best.metrics.auc - baseline.metrics.auc).toFixed(3)}.`);
    }
    lines.push("");
  }

  // Critique.
  lines.push(`## Critical review`);
  lines.push("");
  if (!critique || critique.findings.length === 0) {
    lines.push(`The critic raised no substantiated objections.`);
  } else {
    lines.push(`The critic raised ${critique.findings.length} finding(s) (max severity: **${critique.severity}**):`);
    lines.push("");
    for (const f of critique.findings) {
      lines.push(`- **[${f.severity}] ${f.code}** — ${f.message}`);
    }
  }
  lines.push("");

  // Conclusion — grounded in the measured edge, not merely the absence of a
  // critical flaw. Requires a real lift over baseline and a non-trivial IC.
  lines.push(`## Conclusion`);
  lines.push("");
  const hasHigh = (critique?.severity ?? "none") === "high";
  const lift = baseline ? best.metrics.auc - baseline.metrics.auc : best.metrics.auc - 0.5;
  const ic = best.metrics.informationCoefficient;
  let verdict: string;
  if (hasHigh) {
    verdict = `The evidence **does not support a reliable edge** — a high-severity objection stands`;
  } else if (lift > 0.01 && ic > 0.03) {
    verdict = `The evidence is **consistent with a modest, conditional edge** (AUC lift ${lift.toFixed(3)} over baseline, IC ${ic.toFixed(3)})`;
  } else {
    verdict = `The evidence is **inconclusive** — no reliable edge over the baseline was detected (AUC lift ${lift.toFixed(3)}, IC ${ic.toFixed(3)})`;
  }
  lines.push(
    `${verdict} for the tested momentum signal, **conditional on this simulated dataset and the stated assumptions**. ` +
      `These results are generated on synthetic data for demonstration and must not be read as investment advice or as evidence about any real market.`,
  );
  lines.push("");

  // Warnings.
  if (record.warnings.length > 0) {
    lines.push(`## Warnings`);
    lines.push("");
    for (const w of record.warnings) lines.push(`- ${w}`);
    lines.push("");
  }

  lines.push(`---`);
  lines.push(`_Experiment \`${record.id}\` · ${record.models.length} model(s) · ${record.toolCalls} audited tool calls · schema v${record.schemaVersion}._`);
  return lines.join("\n");
}
