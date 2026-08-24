/**
 * Bundled, deterministic market datasets.
 *
 * The public demo must be self-contained and cost nothing, so we ship
 * synthetic-but-realistic hourly OHLCV series generated from a fixed seed.
 * Each series embeds:
 *   - a modest, genuine autocorrelated drift (so a momentum signal has *some*
 *     real predictive value — the demo is not rigged to always "win"),
 *   - volatility clustering and occasional regime shifts (so naive models are
 *     punished and the critic agent has real weaknesses to surface),
 *   - a small amount of irreducible noise (so perfect prediction is impossible).
 *
 * Because generation is fully seeded, the content hash of a dataset version is
 * stable across machines and runs — the anchor for reproducibility.
 */

import { Rng } from "@/core/ml/rng";
import { hashValue } from "@/core/hash";

export interface OhlcvBar {
  /** Unix epoch milliseconds, UTC, hourly-aligned. */
  t: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Dataset {
  id: string;
  version: string;
  name: string;
  symbol: string;
  frequency: "1h";
  description: string;
  /** Content hash of the bars — identical inputs ⇒ identical hash. */
  contentHash: string;
  bars: OhlcvBar[];
}

export interface DatasetMeta {
  id: string;
  version: string;
  name: string;
  symbol: string;
  frequency: "1h";
  description: string;
  rows: number;
  start: number;
  end: number;
  contentHash: string;
  /**
   * Whether this dataset intentionally contains a leakage trap. Used by the
   * profiling tool's acceptance test; never set on the primary demo dataset.
   */
  leakageFixture: boolean;
}

interface DatasetSpec {
  id: string;
  version: string;
  name: string;
  symbol: string;
  description: string;
  seed: number;
  bars: number;
  /**
   * Strength of the persistent latent-trend component that momentum can detect.
   * Larger ⇒ a stronger (but still noisy) exploitable signal. This is the knob
   * that makes the demo honest: big enough to find, small enough to be fragile.
   */
  trendStrength: number;
  /** Short-horizon mean reversion (returns partially reverse) — hurts momentum. */
  meanRevert: number;
  /** Base hourly volatility. */
  volatility: number;
  startPrice: number;
  leakageFixture: boolean;
}

const HOUR_MS = 3_600_000;
const GENESIS = Date.UTC(2023, 0, 2, 0, 0, 0); // Mon 2023-01-02 00:00 UTC

const SPECS: DatasetSpec[] = [
  {
    id: "synthetic-equity-hourly",
    version: "1.0.0",
    name: "Synthetic Equity — Hourly",
    symbol: "SYN-EQ",
    description:
      "Synthetic single-name hourly OHLCV with mild momentum autocorrelation, " +
      "volatility clustering and two regime shifts. Designed so a momentum " +
      "signal carries modest but non-trivial predictive value.",
    seed: 20240115,
    bars: 4200,
    trendStrength: 0.17,
    meanRevert: 0,
    volatility: 0.006,
    startPrice: 100,
    leakageFixture: false,
  },
  {
    id: "synthetic-fx-hourly",
    version: "1.0.0",
    name: "Synthetic FX — Hourly",
    symbol: "SYN-FX",
    description:
      "Synthetic FX-like hourly series: near-random-walk with short-horizon mean " +
      "reversion and only a faint trend. A harder dataset where momentum should mostly fail.",
    seed: 776541,
    bars: 3600,
    trendStrength: 0.05,
    meanRevert: 0.05,
    volatility: 0.0035,
    startPrice: 1.1,
    leakageFixture: false,
  },
  {
    id: "leakage-trap-hourly",
    version: "1.0.0",
    name: "Leakage Trap — Hourly",
    symbol: "SYN-LK",
    description:
      "Fixture dataset used to verify leakage detection. Contains a column " +
      "whose value is derived from the *future* close. Profiling must flag it.",
    seed: 424242,
    bars: 1500,
    trendStrength: 0.3,
    meanRevert: 0,
    volatility: 0.005,
    startPrice: 50,
    leakageFixture: true,
  },
];

function generateBars(spec: DatasetSpec): OhlcvBar[] {
  const rng = new Rng(spec.seed);
  const bars: OhlcvBar[] = [];
  let price = spec.startPrice;
  // Persistent latent trend: an AR(0.97) process with unit stationary variance.
  // Because it changes slowly, a momentum lookback can estimate it — that is the
  // genuine, exploitable signal. Noise still dominates each individual bar.
  let trend = 0;
  const AR = 0.97;
  const INNOV = Math.sqrt(1 - AR * AR); // keeps var(trend) ≈ 1
  let vol = spec.volatility;
  let prevRet = 0;
  let regime = 1;

  for (let i = 0; i < spec.bars; i++) {
    // Volatility clustering: GARCH-like slow mean reversion of variance.
    vol = 0.94 * vol + 0.06 * spec.volatility * (0.6 + Math.abs(rng.normal()));

    // Three vol/activity regimes across the series (calm → active → calm),
    // which make performance regime-dependent and give the critic real
    // fold-instability to find.
    const phase = i / spec.bars;
    if (phase > 0.66) regime = 0.8;
    else if (phase > 0.33) regime = 1.35;
    else regime = 1;

    trend = AR * trend + INNOV * rng.normal();
    const shock = rng.normal();
    // Return = persistent trend component + short-horizon mean reversion + noise.
    const ret =
      spec.trendStrength * trend * vol * regime -
      spec.meanRevert * prevRet +
      shock * vol;
    prevRet = ret;

    const open = price;
    const close = open * (1 + ret);
    const wick = Math.abs(rng.normal()) * vol * open * 0.5;
    const high = Math.max(open, close) + wick;
    const low = Math.min(open, close) - wick;
    const volume = Math.round(
      1_000_000 * (0.5 + Math.abs(rng.normal()) * 0.5) * (1 + Math.abs(ret) * 20),
    );

    bars.push({
      t: GENESIS + i * HOUR_MS,
      open: round4(open),
      high: round4(high),
      low: round4(low),
      close: round4(close),
      volume,
    });
    price = close;
  }
  return bars;
}

function round4(x: number): number {
  return Math.round(x * 1e4) / 1e4;
}

/** Lazily-built, memoised dataset cache keyed by `id@version`. */
const cache = new Map<string, Dataset>();

function key(id: string, version: string): string {
  return `${id}@${version}`;
}

export function listDatasets(includeFixtures = false): DatasetMeta[] {
  return SPECS.filter((s) => includeFixtures || !s.leakageFixture).map((s) => {
    const ds = getDataset(s.id, s.version);
    return {
      id: ds.id,
      version: ds.version,
      name: ds.name,
      symbol: ds.symbol,
      frequency: ds.frequency,
      description: ds.description,
      rows: ds.bars.length,
      start: ds.bars[0].t,
      end: ds.bars[ds.bars.length - 1].t,
      contentHash: ds.contentHash,
      leakageFixture: s.leakageFixture,
    };
  });
}

export function getDataset(id: string, version = "1.0.0"): Dataset {
  const k = key(id, version);
  const cached = cache.get(k);
  if (cached) return cached;

  const spec = SPECS.find((s) => s.id === id && s.version === version);
  if (!spec) {
    throw new DatasetNotFoundError(id, version);
  }
  const bars = generateBars(spec);
  const dataset: Dataset = {
    id: spec.id,
    version: spec.version,
    name: spec.name,
    symbol: spec.symbol,
    frequency: "1h",
    description: spec.description,
    contentHash: hashValue(bars),
    bars,
  };
  cache.set(k, dataset);
  return dataset;
}

export function datasetExists(id: string, version = "1.0.0"): boolean {
  return SPECS.some((s) => s.id === id && s.version === version);
}

export class DatasetNotFoundError extends Error {
  constructor(id: string, version: string) {
    super(`Dataset not found: ${id}@${version}`);
    this.name = "DatasetNotFoundError";
  }
}
