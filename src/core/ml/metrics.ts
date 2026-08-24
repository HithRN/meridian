/**
 * Classification and ranking metrics.
 *
 * These are the *only* place trading-adjacent predictive quality is quantified;
 * agents are never permitted to assert a metric that did not come from here or
 * from the backtest engine. All metrics are computed on held-out predictions.
 */

import { correlation } from "@/core/ml/stats";

export interface ConfusionMatrix {
  truePositive: number;
  falsePositive: number;
  trueNegative: number;
  falseNegative: number;
}

export interface ClassificationMetrics {
  n: number;
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  /** Area under the ROC curve (rank statistic, threshold-free). */
  auc: number;
  /** Mean binary cross-entropy (lower is better). */
  logLoss: number;
  /** Base rate of the positive class in the evaluation set. */
  baseRate: number;
  /** Correlation of predicted probability with realised forward return. */
  informationCoefficient: number;
  confusion: ConfusionMatrix;
}

export interface Prediction {
  proba: number;
  label: number;
  forwardReturn: number;
}

const EPS = 1e-12;

export function classificationMetrics(
  preds: Prediction[],
  threshold = 0.5,
): ClassificationMetrics {
  const n = preds.length;
  const cm: ConfusionMatrix = {
    truePositive: 0,
    falsePositive: 0,
    trueNegative: 0,
    falseNegative: 0,
  };
  let logLoss = 0;
  let positives = 0;

  for (const p of preds) {
    const yhat = p.proba >= threshold ? 1 : 0;
    if (p.label === 1) positives++;
    if (yhat === 1 && p.label === 1) cm.truePositive++;
    else if (yhat === 1 && p.label === 0) cm.falsePositive++;
    else if (yhat === 0 && p.label === 0) cm.trueNegative++;
    else cm.falseNegative++;

    const clamped = Math.min(1 - 1e-9, Math.max(1e-9, p.proba));
    logLoss += -(p.label * Math.log(clamped) + (1 - p.label) * Math.log(1 - clamped));
  }

  const accuracy = n ? (cm.truePositive + cm.trueNegative) / n : 0;
  const precision =
    cm.truePositive + cm.falsePositive > 0
      ? cm.truePositive / (cm.truePositive + cm.falsePositive)
      : 0;
  const recall =
    cm.truePositive + cm.falseNegative > 0
      ? cm.truePositive / (cm.truePositive + cm.falseNegative)
      : 0;
  const f1 =
    precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

  return {
    n,
    accuracy: round4(accuracy),
    precision: round4(precision),
    recall: round4(recall),
    f1: round4(f1),
    auc: round4(rocAuc(preds)),
    logLoss: round4(n ? logLoss / n : 0),
    baseRate: round4(n ? positives / n : 0),
    informationCoefficient: round4(
      correlation(
        preds.map((p) => p.proba),
        preds.map((p) => p.forwardReturn),
      ),
    ),
    confusion: cm,
  };
}

/** Threshold-free ROC AUC via the Mann–Whitney U statistic. */
export function rocAuc(preds: Prediction[]): number {
  const pos: number[] = [];
  const neg: number[] = [];
  for (const p of preds) (p.label === 1 ? pos : neg).push(p.proba);
  if (pos.length === 0 || neg.length === 0) return 0.5;

  // Rank all scores; ties get average rank.
  const all = preds
    .map((p, i) => ({ score: p.proba, label: p.label, i }))
    .sort((a, b) => a.score - b.score);

  const ranks = new Array(all.length);
  let i = 0;
  while (i < all.length) {
    let j = i;
    while (j < all.length && Math.abs(all[j].score - all[i].score) < EPS) j++;
    const avgRank = (i + j - 1) / 2 + 1; // 1-based average rank
    for (let k = i; k < j; k++) ranks[k] = avgRank;
    i = j;
  }

  let sumRanksPos = 0;
  for (let k = 0; k < all.length; k++) {
    if (all[k].label === 1) sumRanksPos += ranks[k];
  }
  const nPos = pos.length;
  const nNeg = neg.length;
  const auc = (sumRanksPos - (nPos * (nPos + 1)) / 2) / (nPos * nNeg);
  return auc;
}

function round4(x: number): number {
  return Math.round(x * 1e4) / 1e4;
}
