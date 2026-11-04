/**
 * Order-book and candle arithmetic for the live market terminal. Pure functions
 * only, so everything shown on the page can be unit-tested without a network.
 *
 * Levels are always sorted best price first: bids descending, asks ascending.
 */

export interface Level {
  px: number;
  /** Size in the base asset. */
  sz: number;
  /** Number of resting orders at this level. */
  n: number;
}

export type Side = "bid" | "ask";

export interface Candle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export interface BookStats {
  bestBid: number;
  bestAsk: number;
  mid: number;
  spread: number;
  spreadBps: number;
  bidUsd: number;
  askUsd: number;
  /** Share of visible resting value on the bid side, 0 to 1. */
  bidShare: number;
}

export function parseLevels(raw: Array<{ px: string; sz: string; n?: number }> | undefined): Level[] {
  return (raw ?? []).map((l) => ({ px: Number(l.px), sz: Number(l.sz), n: l.n ?? 1 }));
}

const usd = (levels: Level[]) => levels.reduce((s, l) => s + l.px * l.sz, 0);

export function bookStats(bids: Level[], asks: Level[]): BookStats | null {
  if (!bids.length || !asks.length) return null;
  const bestBid = bids[0].px;
  const bestAsk = asks[0].px;
  const mid = (bestBid + bestAsk) / 2;
  const bidUsd = usd(bids);
  const askUsd = usd(asks);
  return {
    bestBid,
    bestAsk,
    mid,
    spread: bestAsk - bestBid,
    spreadBps: ((bestAsk - bestBid) / mid) * 1e4,
    bidUsd,
    askUsd,
    bidShare: bidUsd + askUsd > 0 ? bidUsd / (bidUsd + askUsd) : 0.5,
  };
}

/** Running totals from the best price outward, in the base asset or in USD. */
export function withTotals(levels: Level[], unit: "base" | "usd"): Array<Level & { size: number; total: number }> {
  let total = 0;
  return levels.map((l) => {
    const size = unit === "usd" ? l.px * l.sz : l.sz;
    total += size;
    return { ...l, size, total };
  });
}

/**
 * Extend a precise near-touch book with a coarser, deeper one. The coarse book
 * covers the same orders in wider buckets, so only the size beyond what the fine
 * book already accounts for is added, and never at a better price than the fine
 * book's last level.
 */
export function mergeDepth(fine: Level[], coarse: Level[], side: Side): Level[] {
  if (!fine.length) return coarse;
  const out = [...fine];
  const end = fine[fine.length - 1].px;
  const fineTotal = fine.reduce((s, l) => s + l.sz, 0);
  let coarseTotal = 0;
  let added = 0;
  for (const c of coarse) {
    coarseTotal += c.sz;
    const extra = coarseTotal - fineTotal - added;
    if (extra <= 1e-9) continue;
    const beyond = side === "bid" ? c.px < end : c.px > end;
    out.push({ px: beyond ? c.px : end, sz: extra, n: c.n });
    added += extra;
  }
  return out;
}

export interface ExecutionCost {
  requestedUsd: number;
  filledUsd: number;
  avgPx: number;
  worstPx: number;
  /** Distance of the average fill from the mid price, in basis points. */
  costBps: number;
  costUsd: number;
  /** False when the visible book ran out before the order was filled. */
  complete: boolean;
}

/** Walk one side of the book with a market order of `notionalUsd`. */
export function executionCost(levels: Level[], notionalUsd: number, mid: number): ExecutionCost | null {
  if (!levels.length || notionalUsd <= 0 || mid <= 0) return null;
  let remaining = notionalUsd;
  let base = 0;
  let worstPx = levels[0].px;
  for (const l of levels) {
    if (remaining <= 1e-9) break;
    const take = Math.min(remaining, l.px * l.sz);
    base += take / l.px;
    remaining -= take;
    worstPx = l.px;
  }
  const filledUsd = notionalUsd - remaining;
  const avgPx = base > 0 ? filledUsd / base : levels[0].px;
  const costBps = (Math.abs(avgPx - mid) / mid) * 1e4;
  return {
    requestedUsd: notionalUsd,
    filledUsd,
    avgPx,
    worstPx,
    costBps,
    costUsd: (filledUsd * costBps) / 1e4,
    complete: remaining <= 1e-6,
  };
}

/** Cumulative resting value by price, for the depth chart. */
export function depthCurve(bids: Level[], asks: Level[], mid: number, maxDistance: number): Array<{ px: number; bid?: number; ask?: number }> {
  const walk = (levels: Level[], key: "bid" | "ask") => {
    let total = 0;
    const points: Array<{ px: number; bid?: number; ask?: number }> = [];
    for (const l of levels) {
      if (Math.abs(l.px - mid) / mid > maxDistance) break;
      total += l.px * l.sz;
      points.push({ px: l.px, [key]: total });
    }
    return points;
  };
  return [...walk(bids, "bid").reverse(), ...walk(asks, "ask")];
}

/* ------------------------------------------------------------------ candles */

export const INTERVALS = ["1m", "5m", "15m", "1h", "4h", "1d"] as const;
export type Interval = (typeof INTERVALS)[number];

const MINUTE = 60_000;
export const INTERVAL_MS: Record<Interval, number> = {
  "1m": MINUTE,
  "5m": 5 * MINUTE,
  "15m": 15 * MINUTE,
  "1h": 60 * MINUTE,
  "4h": 240 * MINUTE,
  "1d": 1440 * MINUTE,
};

export function parseCandle(raw: { t: number; o: string; h: string; l: string; c: string; v: string }): Candle {
  return { t: raw.t, o: Number(raw.o), h: Number(raw.h), l: Number(raw.l), c: Number(raw.c), v: Number(raw.v) };
}

/** Apply a streamed candle: update the open candle, or append a new one. */
export function mergeCandle(list: Candle[], next: Candle, cap = 2000): Candle[] {
  const last = list[list.length - 1];
  if (!last || next.t > last.t) return [...list, next].slice(-cap);
  if (next.t === last.t) return [...list.slice(0, -1), next];
  return list;
}

/** Evenly spaced round numbers covering [min, max]. */
export function niceTicks(min: number, max: number, target = 6): number[] {
  if (!(max > min)) return [min];
  const rough = (max - min) / Math.max(1, target);
  const mag = 10 ** Math.floor(Math.log10(rough));
  const norm = rough / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const ticks: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) ticks.push(Number(v.toPrecision(12)));
  return ticks;
}

/* --------------------------------------------------------------- formatting */

/** Perpetual prices carry at most five significant figures. */
export function priceDecimals(px: number): number {
  if (!(px > 0)) return 2;
  return Math.max(0, Math.min(8, 4 - Math.floor(Math.log10(px))));
}

export function formatPrice(px: number, reference = px): string {
  const d = priceDecimals(reference);
  return px.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}

export function formatCompact(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${(v / 1e3).toFixed(1)}k`;
  return v.toFixed(a >= 10 ? 0 : 2);
}

/** Book grouping choices: the feed aggregates by significant figures. */
export function groupingOptions(px: number): Array<{ nSigFigs: number | null; tick: number }> {
  if (!(px > 0)) return [{ nSigFigs: null, tick: 0 }];
  const digits = Math.floor(Math.log10(px)) + 1;
  const tick = (s: number) => Number((10 ** (digits - s)).toPrecision(6));
  return [
    { nSigFigs: null, tick: tick(5) },
    { nSigFigs: 4, tick: tick(4) },
    { nSigFigs: 3, tick: tick(3) },
    { nSigFigs: 2, tick: tick(2) },
  ];
}
