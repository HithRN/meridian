/** Shared shapes for live market research: the plan, the charts and the report. */

import type { Interval } from "@/core/market/book";

export const ANALYSIS_KINDS = ["trend", "volatility", "distribution", "drawdown", "correlation", "signal", "funding", "liquidity", "seasonality", "range", "mev"] as const;
export type AnalysisKind = (typeof ANALYSIS_KINDS)[number];

export const ANALYSIS_LABELS: Record<AnalysisKind, string> = {
  trend: "Trend",
  volatility: "Volatility",
  distribution: "Tail risk",
  drawdown: "Drawdowns",
  correlation: "Correlation",
  signal: "Signal test",
  funding: "Funding",
  liquidity: "Execution cost",
  seasonality: "Time of day",
  range: "Future range",
  mev: "Solana MEV link",
};

export interface SignalSpec {
  mode: "momentum" | "reversion";
  /** A lookback the question named, in hours. Null means choose it walk-forward. */
  lookbackHours: number | null;
}

export interface ResearchPlan {
  question: string;
  /** Traded assets, most relevant first. */
  assets: string[];
  /** Compared against in correlation work. */
  benchmark: string;
  days: number;
  interval: Interval;
  horizonDays: number;
  orderUsd: number;
  signal: SignalSpec;
  analyses: AnalysisKind[];
  /** Assumptions and limits, stated to the reader. */
  notes: string[];
  /** Tickers the question named that are not listed. */
  unknownAssets: string[];
}

export interface PlanOverrides {
  assets?: string[];
  days?: number;
  analyses?: AnalysisKind[];
}

/* -------------------------------------------------------------------- charts */

export interface ChartSeries {
  key: string;
  label: string;
  /** Slot in the categorical order, or a reserved role. */
  color: number | "benchmark" | "up" | "down";
  dashed?: boolean;
}

export type ValueFormat = "price" | "percent" | "percent0" | "index" | "bps" | "number" | "corr" | "sol";

interface ChartBase {
  title: string;
  /** One or two plain sentences on how to read the chart. */
  caption: string;
}

export interface LineChartSpec extends ChartBase {
  type: "line";
  x: "time" | "category";
  format: ValueFormat;
  series: ChartSeries[];
  points: Array<Record<string, number | string | null>>;
  guides?: Array<{ value: number; label: string }>;
  area?: boolean;
}

export interface FanChartSpec extends ChartBase {
  type: "fan";
  format: ValueFormat;
  points: Array<{ day: number; p5: number; p25: number; p50: number; p75: number; p95: number }>;
}

export interface BarChartSpec extends ChartBase {
  type: "bar";
  format: ValueFormat;
  x: "time" | "category";
  points: Array<{ x: string | number; value: number; tone?: "up" | "down" | "highlight" | "muted"; label?: string }>;
  guides?: Array<{ value: number; label: string }>;
}

export interface HistogramChartSpec extends ChartBase {
  type: "histogram";
  bins: Array<{ mid: number; from: number; to: number; count: number; normal: number }>;
}

export interface ScatterChartSpec extends ChartBase {
  type: "scatter";
  xLabel: string;
  yLabel: string;
  xFormat: ValueFormat;
  yFormat: ValueFormat;
  points: Array<{ x: number; y: number; label?: string }>;
  fit?: Array<{ x: number; y: number }>;
}

export interface MatrixChartSpec extends ChartBase {
  type: "matrix";
  labels: string[];
  values: number[][];
}

export type ChartSpec = LineChartSpec | FanChartSpec | BarChartSpec | HistogramChartSpec | ScatterChartSpec | MatrixChartSpec;

/* -------------------------------------------------------------------- report */

export type Verdict = "clear" | "inconclusive" | "measured" | "skipped";

export interface EvidenceTest {
  id: string;
  /** The question the test answers, in plain words. */
  question: string;
  /** Size of the effect, already formatted. */
  effect: string;
  method: string;
  p: number;
  /** After correcting for every test in this report. */
  pAdjusted: number;
  significant: boolean;
}

export interface KeyStat {
  label: string;
  value: string;
  hint?: string;
}

export interface Finding {
  kind: AnalysisKind;
  title: string;
  verdict: Verdict;
  /** The finding as one plain sentence. */
  headline: string;
  stats: KeyStat[];
  table?: { columns: string[]; rows: string[][] };
  charts: ChartSpec[];
  /** Reasons not to over-read the result. */
  cautions: string[];
  method: string;
  testIds: string[];
}

export interface MarketSnapshot {
  coin: string;
  price: number;
  change24h: number;
  volumeUsd: number;
  openInterestUsd: number;
  /** Hourly funding, annualised. */
  fundingApr: number;
}

export interface DataSource {
  id: string;
  label: string;
  source: string;
  rows: number;
  from: number | null;
  to: number | null;
  issues: string[];
}

export interface TraceStep {
  label: string;
  detail?: string;
  ms: number;
}

export interface MarketReport {
  id: string;
  question: string;
  createdAt: number;
  plan: ResearchPlan;
  answer: { headline: string; points: string[]; verdict: Verdict };
  snapshot: MarketSnapshot[];
  findings: Finding[];
  tests: EvidenceTest[];
  /** Results that looked significant alone but not after multiple-testing correction. */
  demoted: number;
  sources: DataSource[];
  trace: TraceStep[];
  fingerprint: string;
  engineVersion: string;
  seed: number;
}

export type ResearchEvent = { type: "step"; step: TraceStep } | { type: "report"; report: MarketReport } | { type: "error"; message: string };
