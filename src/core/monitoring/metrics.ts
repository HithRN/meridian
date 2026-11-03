/**
 * Monitoring metrics for the /monitoring page and /api/monitoring.
 *
 * Composes three views, each labelled with where its numbers come from:
 *   - drift: PSI computed on the bundled dataset (reference = first half of the
 *     feature rows, current = second half) — measured, on synthetic data;
 *   - system health: latency quantiles and error rate *measured* from the audit
 *     log of the seeded reference runs executed on this server instance;
 *   - latency history: a *simulated* 30-hour series, for layout only.
 * There is no uptime figure: the demo has no external uptime monitor.
 */

import { getSeedResults } from "@/core/experiments/seed";
import { getDataset } from "@/core/data/dataset";
import { buildFeatures, DEFAULT_FEATURE_CONFIG } from "@/core/ml/features";
import { driftCheck, type DriftReport } from "@/core/monitoring/drift";
import { Rng } from "@/core/ml/rng";
import { quantile } from "@/core/ml/stats";
import { modelStatus } from "@/core/experiments/lifecycle";

export interface LatencyPoint {
  t: number;
  p50: number;
  p95: number;
  requests: number;
  errorRate: number;
}

export interface ModelPerformance {
  experimentId: string;
  modelType: string;
  auc: number;
  sharpe: number | null;
  status: string;
  createdAt: number;
}

export interface MonitoringSnapshot {
  generatedAt: number;
  drift: DriftReport;
  latencyHistory: LatencyPoint[];
  system: {
    p50Ms: number;
    p95Ms: number;
    p99Ms: number;
    totalToolCalls: number;
    errorCount: number;
    errorRate: number;
    runs: number;
    /** Where these numbers were measured. */
    environment: string;
    windowStart: number;
    windowEnd: number;
  };
  driftContext: {
    dataset: string;
    referenceRows: number;
    currentRows: number;
    referenceSpan: [number, number];
    currentSpan: [number, number];
    thresholds: { watch: number; act: number };
  };
  performance: ModelPerformance[];
  lifecycle: Record<string, number>;
}

export async function getMonitoringSnapshot(): Promise<MonitoringSnapshot> {
  const results = await getSeedResults();

  // --- Drift on the primary dataset (reference = first half). ---
  const ds = getDataset("synthetic-equity-hourly");
  const fs = buildFeatures(ds.bars, DEFAULT_FEATURE_CONFIG);
  const cut = Math.floor(fs.rows.length / 2);
  const reference: Record<string, number[]> = {};
  const current: Record<string, number[]> = {};
  fs.featureNames.forEach((name, j) => {
    reference[name] = fs.rows.slice(0, cut).map((r) => r.features[j]);
    current[name] = fs.rows.slice(cut).map((r) => r.features[j]);
  });
  const drift = driftCheck(reference, current);

  // --- System health from audited tool-call durations. ---
  const durations = results.flatMap((r) => r.audit.map((a) => a.durationMs)).sort((a, b) => a - b);
  const totalToolCalls = durations.length;
  const errors = results.flatMap((r) => r.audit).filter((a) => a.status === "error").length;
  const p50 = durations.length ? quantile(durations, 0.5) : 0;
  const p95 = durations.length ? quantile(durations, 0.95) : 0;
  const p99 = durations.length ? quantile(durations, 0.99) : 0;
  const stamps = results.flatMap((r) => r.audit.map((a) => a.timestamp));

  // --- Seeded synthetic latency/throughput history (30 hourly points). ---
  const rng = new Rng(20240808);
  const now = Date.now();
  const latencyHistory: LatencyPoint[] = [];
  for (let i = 29; i >= 0; i--) {
    const base = 18 + rng.normal(0, 4);
    latencyHistory.push({
      t: now - i * 3_600_000,
      p50: round1(Math.max(4, base)),
      p95: round1(Math.max(8, base * (2.1 + rng.next() * 0.6))),
      requests: Math.round(40 + rng.uniform(0, 60)),
      errorRate: round4(Math.max(0, rng.normal(0.004, 0.003))),
    });
  }

  // --- Model performance history. ---
  const performance: ModelPerformance[] = [];
  for (const r of results) {
    for (const m of r.record.models) {
      performance.push({
        experimentId: r.record.id,
        modelType: m.modelType,
        auc: m.metrics.auc,
        sharpe: m.backtest?.sharpe ?? null,
        status: modelStatus(r.record, m),
        createdAt: r.record.createdAt,
      });
    }
  }

  // --- Lifecycle counts (§12 model lifecycle). ---
  const lifecycle: Record<string, number> = {
    candidate: 0,
    evaluated: 0,
    "approved-for-demo": 0,
    archived: 0,
  };
  for (const r of results) lifecycle[r.record.status] = (lifecycle[r.record.status] ?? 0) + 1;

  return {
    generatedAt: now,
    drift,
    latencyHistory,
    system: {
      p50Ms: round1(p50),
      p95Ms: round1(p95),
      p99Ms: round1(p99),
      totalToolCalls,
      errorCount: errors,
      errorRate: round4(totalToolCalls ? errors / totalToolCalls : 0),
      runs: results.length,
      environment: process.env.VERCEL_ENV ? `Vercel ${process.env.VERCEL_ENV}` : "local server",
      windowStart: stamps.length ? Math.min(...stamps) : now,
      windowEnd: stamps.length ? Math.max(...stamps) : now,
    },
    driftContext: {
      dataset: `${ds.id}@${ds.version}`,
      referenceRows: cut,
      currentRows: fs.rows.length - cut,
      referenceSpan: [fs.rows[0].t, fs.rows[cut - 1].t],
      currentSpan: [fs.rows[cut].t, fs.rows[fs.rows.length - 1].t],
      thresholds: { watch: 0.1, act: 0.25 },
    },
    performance,
    lifecycle,
  };
}

function round1(x: number): number {
  return Math.round(x * 10) / 10;
}
function round4(x: number): number {
  return Math.round(x * 1e4) / 1e4;
}
