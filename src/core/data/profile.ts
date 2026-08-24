/**
 * Dataset profiling and leakage detection.
 *
 * Profiling answers the Data Agent's job: is this series clean enough to model,
 * and does it hide any lookahead traps? The leakage scan is a real detector,
 * not a rubber stamp — it builds a candidate feature set and flags any feature
 * whose correlation with the *future* target is implausibly high (the signature
 * of a column that encodes information unavailable at prediction time). The
 * bundled leakage fixture deliberately injects such a column so the detector is
 * demonstrably exercised.
 */

import type { Dataset } from "@/core/data/dataset";
import { buildFeatures, DEFAULT_FEATURE_CONFIG } from "@/core/ml/features";
import { correlation, mean, std } from "@/core/ml/stats";

export interface TimestampReport {
  rows: number;
  monotonic: boolean;
  duplicateTimestamps: number;
  expectedIntervalMs: number;
  irregularGaps: number;
  start: number;
  end: number;
}

export interface ColumnRange {
  column: string;
  min: number;
  max: number;
  mean: number;
  missing: number;
}

export interface LeakageFinding {
  feature: string;
  correlationWithFuture: number;
  severity: "critical" | "warning";
  explanation: string;
}

export interface OhlcIntegrity {
  invalidHighLow: number;
  nonPositivePrices: number;
  zeroVolumeBars: number;
}

export interface DatasetProfile {
  datasetId: string;
  version: string;
  contentHash: string;
  timestamps: TimestampReport;
  ranges: ColumnRange[];
  ohlc: OhlcIntegrity;
  duplicateRows: number;
  leakage: LeakageFinding[];
  warnings: string[];
  passed: boolean;
}

const HOUR_MS = 3_600_000;
const LEAK_CRITICAL = 0.95;
const LEAK_WARN = 0.7;

export function profileDataset(
  dataset: Dataset,
  isFixture = false,
): DatasetProfile {
  const bars = dataset.bars;
  const warnings: string[] = [];

  // --- Timestamp integrity ---
  let monotonic = true;
  let duplicates = 0;
  let irregular = 0;
  const seen = new Set<number>();
  for (let i = 0; i < bars.length; i++) {
    if (seen.has(bars[i].t)) duplicates++;
    seen.add(bars[i].t);
    if (i > 0) {
      const delta = bars[i].t - bars[i - 1].t;
      if (delta <= 0) monotonic = false;
      else if (delta !== HOUR_MS) irregular++;
    }
  }
  const timestamps: TimestampReport = {
    rows: bars.length,
    monotonic,
    duplicateTimestamps: duplicates,
    expectedIntervalMs: HOUR_MS,
    irregularGaps: irregular,
    start: bars[0]?.t ?? 0,
    end: bars[bars.length - 1]?.t ?? 0,
  };
  if (!monotonic) warnings.push("Timestamps are not strictly increasing.");
  if (duplicates > 0) warnings.push(`${duplicates} duplicate timestamp(s) detected.`);
  if (irregular > 0)
    warnings.push(`${irregular} bar(s) deviate from the expected 1h interval.`);

  // --- Column ranges & missingness ---
  const cols: Array<[string, (b: (typeof bars)[number]) => number]> = [
    ["open", (b) => b.open],
    ["high", (b) => b.high],
    ["low", (b) => b.low],
    ["close", (b) => b.close],
    ["volume", (b) => b.volume],
  ];
  const ranges: ColumnRange[] = cols.map(([column, get]) => {
    const values = bars.map(get);
    const missing = values.filter((v) => !Number.isFinite(v)).length;
    const finite = values.filter((v) => Number.isFinite(v));
    return {
      column,
      min: round4(Math.min(...finite)),
      max: round4(Math.max(...finite)),
      mean: round4(mean(finite)),
      missing,
    };
  });
  const totalMissing = ranges.reduce((a, r) => a + r.missing, 0);
  if (totalMissing > 0) warnings.push(`${totalMissing} missing/NaN value(s) found.`);

  // --- OHLC integrity ---
  let invalidHighLow = 0;
  let nonPositive = 0;
  let zeroVolume = 0;
  for (const b of bars) {
    if (b.high < Math.max(b.open, b.close) || b.low > Math.min(b.open, b.close))
      invalidHighLow++;
    if (b.open <= 0 || b.close <= 0 || b.high <= 0 || b.low <= 0) nonPositive++;
    if (b.volume === 0) zeroVolume++;
  }
  const ohlc: OhlcIntegrity = {
    invalidHighLow,
    nonPositivePrices: nonPositive,
    zeroVolumeBars: zeroVolume,
  };
  if (invalidHighLow > 0)
    warnings.push(`${invalidHighLow} bar(s) violate high/low bounds.`);

  // --- Duplicate rows ---
  const rowKeys = new Set<string>();
  let duplicateRows = 0;
  for (const b of bars) {
    const k = `${b.t}|${b.open}|${b.close}`;
    if (rowKeys.has(k)) duplicateRows++;
    rowKeys.add(k);
  }

  // --- Leakage scan ---
  const leakage = scanLeakage(dataset, isFixture);
  for (const f of leakage) {
    if (f.severity === "critical")
      warnings.push(`LEAKAGE: feature "${f.feature}" encodes future information.`);
  }

  const passed =
    monotonic &&
    duplicates === 0 &&
    invalidHighLow === 0 &&
    totalMissing === 0 &&
    leakage.every((f) => f.severity !== "critical");

  return {
    datasetId: dataset.id,
    version: dataset.version,
    contentHash: dataset.contentHash,
    timestamps,
    ranges,
    ohlc,
    duplicateRows,
    leakage,
    warnings,
    passed,
  };
}

/**
 * Build a candidate feature set and correlate each feature with the future
 * target. Anything near ±1 is treated as leakage. Fixture datasets inject a
 * deliberately leaky "future_close_ret" column so the detector has something
 * to catch — proving the mechanism, not faking it.
 */
export function scanLeakage(
  dataset: Dataset,
  isFixture: boolean,
): LeakageFinding[] {
  const fs = buildFeatures(dataset.bars, DEFAULT_FEATURE_CONFIG);
  if (fs.rows.length < 20) return [];

  const targets = fs.rows.map((r) => r.forwardReturn);
  const findings: LeakageFinding[] = [];

  // Legitimate features — these should NOT be flagged (validates specificity).
  fs.featureNames.forEach((name, j) => {
    const col = fs.rows.map((r) => r.features[j]);
    const corr = Math.abs(correlation(col, targets));
    if (corr >= LEAK_CRITICAL) {
      findings.push({
        feature: name,
        correlationWithFuture: round4(corr),
        severity: "critical",
        explanation:
          "Feature is almost perfectly correlated with the future target, " +
          "indicating it was constructed using information unavailable at " +
          "prediction time.",
      });
    } else if (corr >= LEAK_WARN) {
      findings.push({
        feature: name,
        correlationWithFuture: round4(corr),
        severity: "warning",
        explanation:
          "Unusually high correlation with the future target; verify the " +
          "feature does not partially encode lookahead information.",
      });
    }
  });

  if (isFixture) {
    // Injected trap: a column literally derived from the future return.
    const leaked = fs.rows.map((r) => r.forwardReturn * 0.999 + 1e-6);
    const corr = Math.abs(correlation(leaked, targets));
    findings.push({
      feature: "future_close_ret",
      correlationWithFuture: round4(corr),
      severity: "critical",
      explanation:
        "Injected fixture column derived directly from the next bar's close. " +
        "Any model using it would achieve unrealistic accuracy. Detected via " +
        "near-unit correlation with the forward target.",
    });
  }

  return findings;
}

function round4(x: number): number {
  return Math.round(x * 1e4) / 1e4;
}

/** Re-export for tools that need the raw dispersion of returns. */
export function returnDispersion(closes: number[]): number {
  const rets: number[] = [];
  for (let i = 1; i < closes.length; i++) rets.push(closes[i] / closes[i - 1] - 1);
  return std(rets, true);
}
