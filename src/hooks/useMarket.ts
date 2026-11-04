"use client";

/**
 * Live market data from Hyperliquid's public, keyless API, read directly by the
 * browser. One WebSocket is shared by every panel and reconnects with backoff;
 * while it is down, each hook polls the REST endpoint instead, so the page keeps
 * updating (more slowly) on networks that block WebSockets.
 *
 * Read-only: nothing here signs, submits or holds anything.
 */

import { useEffect, useState } from "react";
import { INTERVAL_MS, mergeCandle, parseCandle, parseLevels, type Candle, type Interval, type Level } from "@/core/market/book";

const WS_URL = "wss://api.hyperliquid.xyz/ws";
const INFO_URL = "https://api.hyperliquid.xyz/info";
const POLL_MS = 3_000;

export type FeedStatus = "connecting" | "open" | "closed";
type Handler = (data: unknown) => void;
interface Subscription {
  message: Record<string, unknown>;
  channel: string;
  handler: Handler;
}

class MarketFeed {
  status: FeedStatus = "closed";
  private ws: WebSocket | null = null;
  private subs = new Set<Subscription>();
  private listeners = new Set<(s: FeedStatus) => void>();
  private retry = 0;
  private ping: ReturnType<typeof setInterval> | null = null;
  private reconnect: ReturnType<typeof setTimeout> | null = null;
  private idle: ReturnType<typeof setTimeout> | null = null;

  subscribe(message: Record<string, unknown>, channel: string, handler: Handler): () => void {
    const sub: Subscription = { message, channel, handler };
    this.subs.add(sub);
    if (this.idle) clearTimeout(this.idle);
    this.connect();
    this.send({ method: "subscribe", subscription: message });
    return () => {
      this.subs.delete(sub);
      this.send({ method: "unsubscribe", subscription: message });
      // Pages unmount and remount during navigation; close only if nothing returns.
      if (!this.subs.size) this.idle = setTimeout(() => this.shutdown(), 5_000);
    };
  }

  onStatus(listener: (s: FeedStatus) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private setStatus(s: FeedStatus) {
    this.status = s;
    this.listeners.forEach((l) => l(s));
  }

  private send(payload: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(payload));
  }

  private connect() {
    if (this.ws || this.reconnect || typeof WebSocket === "undefined") return;
    this.setStatus("connecting");
    let ws: WebSocket;
    try {
      ws = new WebSocket(WS_URL);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      this.setStatus("open");
      this.subs.forEach((s) => this.send({ method: "subscribe", subscription: s.message }));
      this.ping = setInterval(() => this.send({ method: "ping" }), 30_000);
    };
    ws.onmessage = (e) => {
      let msg: { channel?: string; data?: unknown };
      try {
        msg = JSON.parse(String(e.data));
      } catch {
        return;
      }
      if (!msg.channel || msg.data === undefined) return;
      const key = channelKey(msg.channel, msg.data);
      this.subs.forEach((s) => {
        if (s.channel === key) s.handler(msg.data);
      });
    };
    ws.onerror = () => ws.close();
    ws.onclose = () => {
      if (this.ping) clearInterval(this.ping);
      this.ping = null;
      this.ws = null;
      this.setStatus("closed");
      if (this.subs.size) this.scheduleReconnect();
    };
  }

  private scheduleReconnect() {
    this.retry += 1;
    this.reconnect = setTimeout(() => {
      this.reconnect = null;
      if (this.subs.size) this.connect();
    }, Math.min(30_000, 1_000 * 2 ** Math.min(this.retry, 5)));
  }

  private shutdown() {
    if (this.subs.size) return;
    this.ws?.close();
  }
}

function channelKey(channel: string, data: unknown): string {
  const d = data as { coin?: string; s?: string; i?: string } & Array<{ coin?: string }>;
  if (channel === "trades") return `trades:${d[0]?.coin}`;
  if (channel === "candle") return `candle:${d.s}:${d.i}`;
  return `${channel}:${d.coin}`;
}

let feed: MarketFeed | null = null;
const getFeed = () => (feed ??= new MarketFeed());

async function info<T>(body: unknown): Promise<T> {
  const res = await fetch(INFO_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

/** Run `poll` immediately, then on a timer whenever the stream is not open. */
function pollWhileDown(poll: () => void): () => void {
  poll();
  const timer = setInterval(() => {
    if (getFeed().status !== "open" && !document.hidden) poll();
  }, POLL_MS);
  return () => clearInterval(timer);
}

export function useFeedStatus(): FeedStatus {
  const [status, setStatus] = useState<FeedStatus>("connecting");
  useEffect(() => getFeed().onStatus(setStatus), []);
  return status;
}

/* --------------------------------------------------------------------- book */

export interface LiveBook {
  bids: Level[];
  asks: Level[];
  time: number;
}

interface RawBook {
  time: number;
  levels: [Array<{ px: string; sz: string; n: number }>, Array<{ px: string; sz: string; n: number }>];
}

const toBook = (raw: RawBook): LiveBook => ({ bids: parseLevels(raw.levels[0]), asks: parseLevels(raw.levels[1]), time: raw.time });

export function useBook(coin: string, nSigFigs: number | null): LiveBook | null {
  const [book, setBook] = useState<LiveBook | null>(null);
  useEffect(() => {
    let alive = true;
    const request = { type: "l2Book", coin, ...(nSigFigs ? { nSigFigs } : {}) };
    const stopPoll = pollWhileDown(() => {
      info<RawBook>(request)
        .then((r) => alive && setBook(toBook(r)))
        .catch(() => undefined);
    });
    const stopSub = getFeed().subscribe(request, `l2Book:${coin}`, (d) => alive && setBook(toBook(d as RawBook)));
    return () => {
      alive = false;
      stopPoll();
      stopSub();
    };
  }, [coin, nSigFigs]);
  return book;
}

/** A coarser snapshot reaching further from the mid price, for large-order costs. */
export function useDeepBook(coin: string): LiveBook | null {
  const [book, setBook] = useState<LiveBook | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () => {
      if (document.hidden) return;
      info<RawBook>({ type: "l2Book", coin, nSigFigs: 3 })
        .then((r) => alive && setBook(toBook(r)))
        .catch(() => undefined);
    };
    load();
    const timer = setInterval(load, 5_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [coin]);
  return book;
}

/* ------------------------------------------------------------------- trades */

export interface Trade {
  id: number;
  px: number;
  sz: number;
  side: "buy" | "sell";
  time: number;
}

interface RawTrade {
  px: string;
  sz: string;
  side: string;
  time: number;
  tid: number;
}

const toTrade = (t: RawTrade): Trade => ({ id: t.tid, px: Number(t.px), sz: Number(t.sz), side: t.side === "B" ? "buy" : "sell", time: t.time });

/** Newest first, without duplicates when a poll overlaps the stream. */
function addTrades(existing: Trade[], incoming: Trade[], cap: number): Trade[] {
  const seen = new Set(existing.map((t) => t.id));
  const fresh = incoming.filter((t) => !seen.has(t.id));
  if (!fresh.length) return existing;
  return [...fresh, ...existing].sort((a, b) => b.time - a.time).slice(0, cap);
}

export function useTrades(coin: string, cap = 80): Trade[] {
  const [trades, setTrades] = useState<Trade[]>([]);
  useEffect(() => {
    let alive = true;
    const stopPoll = pollWhileDown(() => {
      info<RawTrade[]>({ type: "recentTrades", coin })
        .then((r) => alive && setTrades((prev) => addTrades(prev, r.map(toTrade), cap)))
        .catch(() => undefined);
    });
    const stopSub = getFeed().subscribe({ type: "trades", coin }, `trades:${coin}`, (d) => {
      if (alive) setTrades((prev) => addTrades(prev, (d as RawTrade[]).map(toTrade), cap));
    });
    return () => {
      alive = false;
      stopPoll();
      stopSub();
    };
  }, [coin, cap]);
  return trades;
}

/* ------------------------------------------------------------------ candles */

export function useCandles(coin: string, interval: Interval, history = 800): { candles: Candle[]; failed: boolean } {
  const [candles, setCandles] = useState<Candle[]>([]);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    const step = INTERVAL_MS[interval];
    const snapshot = (count: number) =>
      info<Array<Parameters<typeof parseCandle>[0]>>({
        type: "candleSnapshot",
        req: { coin, interval, startTime: Date.now() - count * step, endTime: Date.now() },
      }).then((r) => r.map(parseCandle));

    snapshot(history)
      .then((list) => {
        if (!alive) return;
        // Keep anything the stream delivered while history was loading.
        setCandles((prev) => prev.reduce(mergeCandle, list));
      })
      .catch(() => alive && setFailed(true));

    const timer = setInterval(() => {
      if (getFeed().status === "open" || document.hidden) return;
      snapshot(3)
        .then((list) => alive && setCandles((prev) => list.reduce(mergeCandle, prev)))
        .catch(() => undefined);
    }, POLL_MS);
    const stopSub = getFeed().subscribe({ type: "candle", coin, interval }, `candle:${coin}:${interval}`, (d) => {
      if (alive) setCandles((prev) => mergeCandle(prev, parseCandle(d as Parameters<typeof parseCandle>[0])));
    });
    return () => {
      alive = false;
      clearInterval(timer);
      stopSub();
    };
  }, [coin, interval, history]);
  return { candles, failed };
}

/* ------------------------------------------------------------ market stats */

export interface AssetContext {
  mark: number;
  oracle: number;
  prevDay: number;
  dayVolumeUsd: number;
  openInterest: number;
  /** Hourly funding rate. */
  funding: number;
}

interface RawCtx {
  markPx: string;
  oraclePx: string;
  prevDayPx: string;
  dayNtlVlm: string;
  openInterest: string;
  funding: string;
}

const toCtx = (c: RawCtx): AssetContext => ({
  mark: Number(c.markPx),
  oracle: Number(c.oraclePx),
  prevDay: Number(c.prevDayPx),
  dayVolumeUsd: Number(c.dayNtlVlm),
  openInterest: Number(c.openInterest),
  funding: Number(c.funding),
});

async function fetchContext(coin: string): Promise<AssetContext | null> {
  const [meta, ctxs] = await info<[{ universe: Array<{ name: string }> }, RawCtx[]]>({ type: "metaAndAssetCtxs" });
  const i = meta.universe.findIndex((u) => u.name === coin);
  return i >= 0 ? toCtx(ctxs[i]) : null;
}

export function useAssetContext(coin: string): AssetContext | null {
  const [ctx, setCtx] = useState<AssetContext | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () => {
      fetchContext(coin)
        .then((c) => alive && c && setCtx(c))
        .catch(() => undefined);
    };
    load();
    const timer = setInterval(() => {
      if (getFeed().status !== "open" && !document.hidden) load();
    }, 10_000);
    const stopSub = getFeed().subscribe({ type: "activeAssetCtx", coin }, `activeAssetCtx:${coin}`, (d) => {
      if (alive) setCtx(toCtx((d as { ctx: RawCtx }).ctx));
    });
    return () => {
      alive = false;
      clearInterval(timer);
      stopSub();
    };
  }, [coin]);
  return ctx;
}
