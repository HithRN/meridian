/**
 * Live data for market research. Analyses read through `MarketData`, an interface
 * with a live implementation and fixtures in tests, and each request is recorded
 * so the report can say exactly what it was computed from.
 */

import { INTERVAL_MS, parseCandle, parseLevels, type Interval, type Level } from "@/core/market/book";
import { EPOCH_ANCHORS, epochStartFromAnchors, liveEpochAnchors } from "@/core/solana/epochs";
import { fetchEpochHistory } from "@/core/solana/intel";
import { fnv1a64 } from "@/core/hash";
import type { DataSource, MarketSnapshot, TraceStep } from "@/core/market/research/types";

export interface Bar {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  /** Trades in the bar. Zero means the price was backfilled, not traded here. */
  n: number;
}

export interface FundingPoint {
  t: number;
  rate: number;
}

export interface EpochPoint {
  epoch: number;
  totalMevSol: number;
}

export interface MarketFeedSource {
  universe(): Promise<Set<string>>;
  snapshot(coins: string[]): Promise<MarketSnapshot[]>;
  candles(coin: string, interval: Interval, count: number, now: number): Promise<Bar[]>;
  funding(coin: string, startMs: number, now: number): Promise<FundingPoint[]>;
  book(coin: string, nSigFigs: number | null): Promise<{ bids: Level[]; asks: Level[] }>;
  epochs(count: number): Promise<{ data: EpochPoint[]; source: string }>;
  /** Start time in ms of each requested epoch. */
  epochStarts(epochs: number[]): Promise<{ starts: Map<number, number>; source: string }>;
}

const INFO_URL = "https://api.hyperliquid.xyz/info";
const CANDLE_LIMIT = 5000;
const FUNDING_PAGE = 500;
const MAX_FUNDING_PAGES = 12;

async function info<T>(body: unknown): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(INFO_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(12_000),
      cache: "no-store",
    });
    if (res.ok) return res.json() as Promise<T>;
    if (res.status !== 429 || attempt >= 2) throw new Error(`Market data request failed (HTTP ${res.status})`);
    await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
  }
}

interface RawMeta {
  universe: Array<{ name: string; isDelisted?: boolean }>;
}
interface RawCtx {
  markPx: string;
  prevDayPx: string;
  dayNtlVlm: string;
  openInterest: string;
  funding: string;
}

export const liveFeed: MarketFeedSource = {
  async universe() {
    const meta = await info<RawMeta>({ type: "meta" });
    return new Set(meta.universe.filter((u) => !u.isDelisted).map((u) => u.name));
  },

  async snapshot(coins) {
    const [meta, ctxs] = await info<[RawMeta, RawCtx[]]>({ type: "metaAndAssetCtxs" });
    return coins.flatMap((coin) => {
      const i = meta.universe.findIndex((u) => u.name === coin);
      if (i < 0) return [];
      const c = ctxs[i];
      const price = Number(c.markPx);
      const prev = Number(c.prevDayPx);
      return [
        {
          coin,
          price,
          change24h: prev > 0 ? price / prev - 1 : 0,
          volumeUsd: Number(c.dayNtlVlm),
          openInterestUsd: Number(c.openInterest) * price,
          fundingApr: Number(c.funding) * 24 * 365,
        },
      ];
    });
  },

  async candles(coin, interval, count, now) {
    const raw = await info<Array<Parameters<typeof parseCandle>[0] & { n?: number }>>({
      type: "candleSnapshot",
      req: { coin, interval, startTime: now - count * INTERVAL_MS[interval], endTime: now },
    });
    return raw.map((r) => ({ ...parseCandle(r), n: r.n ?? 0 }));
  },

  async funding(coin, startMs, now) {
    const out: FundingPoint[] = [];
    let from = startMs;
    for (let page = 0; page < MAX_FUNDING_PAGES && from < now; page++) {
      const rows = await info<Array<{ fundingRate: string; time: number }>>({ type: "fundingHistory", coin, startTime: from });
      if (!rows.length) break;
      for (const r of rows) out.push({ t: r.time, rate: Number(r.fundingRate) });
      if (rows.length < FUNDING_PAGE) break;
      from = rows[rows.length - 1].time + 1;
    }
    return out;
  },

  async book(coin, nSigFigs) {
    const raw = await info<{ levels: [Array<{ px: string; sz: string; n: number }>, Array<{ px: string; sz: string; n: number }>] }>({
      type: "l2Book",
      coin,
      ...(nSigFigs ? { nSigFigs } : {}),
    });
    return { bids: parseLevels(raw.levels[0]), asks: parseLevels(raw.levels[1]) };
  },

  async epochs(count) {
    const { data, source } = await fetchEpochHistory(count);
    return { data, source };
  },

  async epochStarts(epochs) {
    let anchors: typeof EPOCH_ANCHORS = EPOCH_ANCHORS;
    let source = "Epoch dates from block times measured on 4 Nov 2026";
    try {
      anchors = await liveEpochAnchors(Math.min(...epochs));
      source = "Solana RPC block times";
    } catch {
      // Keep the measured anchors.
    }
    return { starts: new Map(epochs.map((e) => [e, epochStartFromAnchors(anchors, e)])), source };
  },
};

/** Keep only finished candles that really traded here, and report what was removed. */
export function cleanBars(raw: readonly Bar[], interval: Interval, now: number): { bars: Bar[]; issues: string[] } {
  const step = INTERVAL_MS[interval];
  const finished = raw.filter((b) => b.t + step <= now);
  const firstTraded = finished.findIndex((b) => b.n > 0);
  const bars = firstTraded < 0 ? [] : finished.slice(firstTraded).filter((b) => b.c > 0);
  const issues: string[] = [];
  if (firstTraded > 0) issues.push(`${firstTraded} earlier candles were backfilled before this market traded and were left out.`);
  let missing = 0;
  for (let i = 1; i < bars.length; i++) missing += Math.max(0, Math.round((bars[i].t - bars[i - 1].t) / step) - 1);
  if (missing > 0) issues.push(`${missing} candles are missing from the feed.`);
  const last = bars[bars.length - 1];
  if (last && now - (last.t + step) > 2 * step + 60_000) issues.push("The latest candle is older than expected.");
  return { bars, issues };
}

/** Candles per request, and enough history to judge "unusual" against. */
export function contextBars(days: number, interval: Interval): number {
  return Math.min(CANDLE_LIMIT, Math.ceil((days * 4 * 86_400_000) / INTERVAL_MS[interval]));
}

/** Memoised, recorded access to the feed for a single report. */
export class ResearchData {
  readonly sources = new Map<string, DataSource>();
  readonly trace: TraceStep[] = [];
  private cache = new Map<string, Promise<unknown>>();
  private hashes: string[] = [];

  constructor(
    readonly feed: MarketFeedSource,
    readonly now: number,
    private onStep?: (step: TraceStep) => void,
  ) {}

  /** Time an operation and record it in the audit trail. */
  async step<T>(label: string, work: () => Promise<T>, detail?: (r: T) => string): Promise<T> {
    const started = Date.now();
    const result = await work();
    const step = { label, detail: detail?.(result), ms: Date.now() - started };
    this.trace.push(step);
    this.onStep?.(step);
    return result;
  }

  private once<T>(key: string, load: () => Promise<T>): Promise<T> {
    const hit = this.cache.get(key);
    if (hit) return hit as Promise<T>;
    const p = load();
    this.cache.set(key, p);
    return p;
  }

  private record(source: DataSource, payload: unknown) {
    this.sources.set(source.id, source);
    this.hashes.push(`${source.id}:${fnv1a64(JSON.stringify(payload))}`);
  }

  candles(coin: string, interval: Interval, count: number): Promise<Bar[]> {
    return this.once(`candles:${coin}:${interval}:${count}`, () =>
      this.step(
        `Fetched ${coin} ${interval} candles`,
        async () => {
          const { bars, issues } = cleanBars(await this.feed.candles(coin, interval, count, this.now), interval, this.now);
          this.record(
            { id: `${coin}:${interval}:${count}`, label: `${coin} ${interval} candles`, source: "Hyperliquid", rows: bars.length, from: bars[0]?.t ?? null, to: bars[bars.length - 1]?.t ?? null, issues },
            bars.map((b) => [b.t, b.c, b.v]),
          );
          return bars;
        },
        (bars) => `${bars.length.toLocaleString("en-US")} finished candles`,
      ),
    );
  }

  funding(coin: string, days: number): Promise<FundingPoint[]> {
    return this.once(`funding:${coin}:${days}`, () =>
      this.step(
        `Fetched ${coin} funding history`,
        async () => {
          const rows = await this.feed.funding(coin, this.now - days * 86_400_000, this.now);
          const issues = rows.length && rows[0].t > this.now - days * 86_400_000 + 3 * 3_600_000 ? ["Funding history is shorter than the requested window."] : [];
          this.record({ id: `${coin}:funding:${days}`, label: `${coin} hourly funding`, source: "Hyperliquid", rows: rows.length, from: rows[0]?.t ?? null, to: rows[rows.length - 1]?.t ?? null, issues }, rows);
          return rows;
        },
        (rows) => `${rows.length.toLocaleString("en-US")} hourly rates`,
      ),
    );
  }

  book(coin: string, nSigFigs: number | null) {
    return this.once(`book:${coin}:${nSigFigs}`, () =>
      this.step(
        `Read ${coin} order book`,
        async () => {
          const b = await this.feed.book(coin, nSigFigs);
          this.record({ id: `${coin}:book:${nSigFigs ?? "full"}`, label: `${coin} order book${nSigFigs ? " (wide buckets)" : ""}`, source: "Hyperliquid", rows: b.bids.length + b.asks.length, from: this.now, to: this.now, issues: [] }, b);
          return b;
        },
        (b) => `${b.bids.length + b.asks.length} price levels`,
      ),
    );
  }

  epochs(count: number) {
    return this.once(`epochs:${count}`, () =>
      this.step(
        "Fetched Solana epoch MEV",
        async () => {
          const r = await this.feed.epochs(count);
          this.record({ id: "epochs", label: "Solana epoch MEV rewards", source: r.source === "live" ? "Jito public API" : "Jito snapshot bundled with Meridian", rows: r.data.length, from: null, to: null, issues: [] }, r.data);
          return r;
        },
        (r) => `${r.data.length} epochs`,
      ),
    );
  }

  epochStarts(epochs: number[]) {
    return this.step(
      "Dated the epochs",
      async () => {
        const r = await this.feed.epochStarts(epochs);
        this.record({ id: "epoch-dates", label: "Solana epoch dates", source: r.source, rows: r.starts.size, from: Math.min(...r.starts.values()), to: Math.max(...r.starts.values()), issues: [] }, [...r.starts]);
        return r;
      },
      (r) => r.source,
    );
  }

  /** A fingerprint of every input, so two reports can be compared. */
  fingerprint(): string {
    return fnv1a64([...this.hashes].sort().join("|"));
  }
}
