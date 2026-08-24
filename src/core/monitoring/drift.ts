/**
 * Distributional drift detection.
 *
 * Compares a reference sample (e.g. training-window feature/return distribution)
 * against a current sample using the Population Stability Index (PSI) and a
 * simple mean/variance shift. PSI thresholds follow the common convention:
 *   PSI < 0.1  → stable
 *   0.1–0.25   → moderate drift (watch)
 *   > 0.25     → significant drift (act)
 */

import { mean, std, quantile } from "@/core/ml/stats";

export interface DriftMetric {
  name: string;
  psi: number;
  meanShift: number;
  stdRatio: number;
  status: "stable" | "moderate" | "significant";
}

export interface DriftReport {
  metrics: DriftMetric[];
  maxPsi: number;
  status: "stable" | "moderate" | "significant";
  warnings: string[];
}

const EPS = 1e-6;

function psi(reference: number[], current: number[], bins = 10): number {
  if (reference.length < bins || current.length < bins) return 0;
  const sorted = [...reference].sort((a, b) => a - b);
  // Quantile edges from the reference distribution.
  const edges: number[] = [];
  for (let i = 1; i < bins; i++) edges.push(quantile(sorted, i / bins));

  const bucket = (x: number): number => {
    let b = 0;
    while (b < edges.length && x > edges[b]) b++;
    return b;
  };

  const refCounts = new Array(bins).fill(0);
  const curCounts = new Array(bins).fill(0);
  for (const x of reference) refCounts[bucket(x)]++;
  for (const x of current) curCounts[bucket(x)]++;

  let total = 0;
  for (let b = 0; b < bins; b++) {
    const refPct = refCounts[b] / reference.length + EPS;
    const curPct = curCounts[b] / current.length + EPS;
    total += (curPct - refPct) * Math.log(curPct / refPct);
  }
  return total;
}

function classify(value: number): DriftMetric["status"] {
  if (value > 0.25) return "significant";
  if (value > 0.1) return "moderate";
  return "stable";
}

export function driftCheck(
  reference: Record<string, number[]>,
  current: Record<string, number[]>,
): DriftReport {
  const metrics: DriftMetric[] = [];
  const warnings: string[] = [];

  for (const name of Object.keys(reference)) {
    const ref = reference[name];
    const cur = current[name] ?? [];
    if (cur.length === 0) continue;
    const p = psi(ref, cur);
    const rMean = mean(ref);
    const cMean = mean(cur);
    const rStd = std(ref, true) || EPS;
    const cStd = std(cur, true) || EPS;
    const status = classify(p);
    if (status === "significant")
      warnings.push(`Significant drift in "${name}" (PSI ${p.toFixed(3)}).`);
    metrics.push({
      name,
      psi: round4(p),
      meanShift: round4((cMean - rMean) / rStd),
      stdRatio: round4(cStd / rStd),
      status,
    });
  }

  const maxPsi = metrics.reduce((m, x) => Math.max(m, x.psi), 0);
  return { metrics, maxPsi: round4(maxPsi), status: classify(maxPsi), warnings };
}

function round4(x: number): number {
  return Math.round(x * 1e4) / 1e4;
}
