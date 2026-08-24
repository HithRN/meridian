/**
 * Critic agent — adversarial methodology review (§6, §10, §21).
 *
 * The critic's job is to *falsify*, not to celebrate. It inspects the validation
 * design and the measured results and raises findings for every weakness it can
 * substantiate: insufficient sample, leakage, accuracy no better than the base
 * rate, a near-zero or wrong-signed information coefficient, fold instability,
 * and profitability that evaporates once transaction costs are applied. The
 * reporter is not allowed to mark an experiment complete until the critic has
 * run, so this gate is structural.
 *
 * Crucially, the critic operates only on numbers produced by deterministic
 * tools — it never invents a metric of its own.
 */

import type { ResearchPlan } from "@/core/orchestrator/types";
import type { Critique } from "@/core/schemas/experiment";
import type { ClassificationMetrics } from "@/core/ml/metrics";
import { std } from "@/core/ml/stats";

export interface CriticInput {
  plan: ResearchPlan;
  oosCount: number;
  leakageCritical: number;
  best: {
    modelType: string;
    metrics: ClassificationMetrics;
    sharpeGross: number;
    sharpeNet: number;
    maxDrawdown: number;
    exposure: number;
    benchmarkReturn: number;
    totalReturnNet: number;
  };
  baseline: { metrics: ClassificationMetrics };
  foldAucs: number[];
}

type Finding = Critique["findings"][number];

const SEVERITY_RANK: Record<Finding["severity"], number> = { low: 1, medium: 2, high: 3 };

export function critique(input: CriticInput): Critique {
  const findings: Finding[] = [];
  const { best, baseline, oosCount, foldAucs, plan } = input;

  // 1. Sample sufficiency.
  if (oosCount < 150) {
    findings.push({
      code: "INSUFFICIENT_SAMPLE",
      severity: oosCount < 60 ? "high" : "medium",
      message: `Only ${oosCount} out-of-sample observations; metrics are high-variance and may not generalise.`,
    });
  }

  // 2. Leakage (should already have been blocked upstream — defence in depth).
  if (input.leakageCritical > 0) {
    findings.push({
      code: "LEAKAGE_DETECTED",
      severity: "high",
      message: `${input.leakageCritical} feature(s) encode future information; results are invalid until removed.`,
    });
  }

  // 3. Accuracy relative to the base rate.
  const edge = best.metrics.accuracy - Math.max(best.metrics.baseRate, 1 - best.metrics.baseRate);
  if (edge <= 0.005) {
    findings.push({
      code: "NO_EDGE_OVER_BASE_RATE",
      severity: "medium",
      message: `Best model accuracy (${best.metrics.accuracy.toFixed(3)}) does not meaningfully exceed the majority-class rate (${Math.max(best.metrics.baseRate, 1 - best.metrics.baseRate).toFixed(3)}).`,
    });
  }

  // 4. Ranking quality.
  if (best.metrics.auc < 0.52) {
    findings.push({
      code: "WEAK_RANKING",
      severity: "medium",
      message: `AUC of ${best.metrics.auc.toFixed(3)} is close to chance (0.50); the score barely ranks winners above losers.`,
    });
  }

  // 5. Information coefficient sign/magnitude.
  const ic = best.metrics.informationCoefficient;
  if (Math.abs(ic) < 0.02) {
    findings.push({
      code: "NEGLIGIBLE_IC",
      severity: "medium",
      message: `Information coefficient (${ic.toFixed(4)}) is negligible; predicted probability is nearly uncorrelated with realised return.`,
    });
  } else if (ic < 0) {
    findings.push({
      code: "NEGATIVE_IC",
      severity: "high",
      message: `Information coefficient is negative (${ic.toFixed(4)}); the signal is anti-predictive on this data.`,
    });
  }

  // 6. Fold stability.
  if (foldAucs.length >= 2) {
    const dispersion = std(foldAucs, true);
    if (dispersion > 0.08) {
      findings.push({
        code: "UNSTABLE_ACROSS_FOLDS",
        severity: "medium",
        message: `AUC varies by ${dispersion.toFixed(3)} across folds; performance is regime-dependent and not stable through time.`,
      });
    }
  }

  // 7. Cost sensitivity.
  if (plan.includeCosts) {
    if (best.sharpeGross > 0.1 && best.sharpeNet <= 0) {
      findings.push({
        code: "PROFIT_ERODED_BY_COSTS",
        severity: "high",
        message: `Gross Sharpe (${best.sharpeGross.toFixed(2)}) turns non-positive after costs (${best.sharpeNet.toFixed(2)}); the edge does not survive realistic frictions.`,
      });
    } else if (best.sharpeNet < best.sharpeGross * 0.5 && best.sharpeGross > 0) {
      findings.push({
        code: "HIGH_COST_DRAG",
        severity: "low",
        message: `Costs remove more than half of gross Sharpe (${best.sharpeGross.toFixed(2)} → ${best.sharpeNet.toFixed(2)}); the strategy is turnover-sensitive.`,
      });
    }
  }

  // 8. Failure to beat buy-and-hold.
  if (best.totalReturnNet < input.best.benchmarkReturn && best.exposure > 0.1) {
    findings.push({
      code: "UNDERPERFORMS_BENCHMARK",
      severity: "low",
      message: `Net return (${(best.totalReturnNet * 100).toFixed(2)}%) trails buy-and-hold (${(input.best.benchmarkReturn * 100).toFixed(2)}%) over the same window.`,
    });
  }

  // 9. Did the "learned" model actually beat the baseline?
  if (best.modelType !== "majority" && best.metrics.auc <= baseline.metrics.auc + 0.005) {
    findings.push({
      code: "NO_LIFT_OVER_BASELINE",
      severity: "medium",
      message: `The learned model does not out-rank the trivial baseline (AUC ${best.metrics.auc.toFixed(3)} vs ${baseline.metrics.auc.toFixed(3)}).`,
    });
  }

  const maxSeverity = findings.reduce<Finding["severity"] | null>((acc, f) => {
    if (!acc) return f.severity;
    return SEVERITY_RANK[f.severity] > SEVERITY_RANK[acc] ? f.severity : acc;
  }, null);

  return {
    // "passed" means the result is trustworthy enough to publish as a positive
    // finding — i.e. no high-severity methodological objection stands.
    passed: !findings.some((f) => f.severity === "high"),
    severity: maxSeverity ?? "none",
    findings,
  };
}
