"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { bookStats, formatPrice, groupingOptions, withTotals, type Level } from "@/core/market/book";
import type { LiveBook, Trade } from "@/hooks/useMarket";

const ROWS = 13;

const fmtSize = (v: number, usd: boolean) =>
  usd
    ? v.toLocaleString("en-US", { maximumFractionDigits: 0 })
    : v.toLocaleString("en-US", { maximumFractionDigits: v >= 1000 ? 0 : v >= 1 ? 2 : 5 });

export function OrderBook({
  coin,
  book,
  nSigFigs,
  onGrouping,
}: {
  coin: string;
  book: LiveBook | null;
  nSigFigs: number | null;
  onGrouping: (n: number | null) => void;
}) {
  const [unit, setUnit] = React.useState<"base" | "usd">("base");
  const stats = book ? bookStats(book.bids, book.asks) : null;
  const reference = stats?.mid ?? 1;

  // Row bars share one scale, so the two sides can be compared directly.
  const asks = book ? withTotals(book.asks.slice(0, ROWS), unit) : [];
  const bids = book ? withTotals(book.bids.slice(0, ROWS), unit) : [];
  const maxTotal = Math.max(asks[asks.length - 1]?.total ?? 0, bids[bids.length - 1]?.total ?? 0, 1e-9);
  const usd = unit === "usd";

  const visibleBidUsd = (book?.bids.slice(0, ROWS) ?? []).reduce((s: number, l: Level) => s + l.px * l.sz, 0);
  const visibleAskUsd = (book?.asks.slice(0, ROWS) ?? []).reduce((s: number, l: Level) => s + l.px * l.sz, 0);
  const bidShare = visibleBidUsd + visibleAskUsd > 0 ? visibleBidUsd / (visibleBidUsd + visibleAskUsd) : 0.5;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-[0.85rem] text-muted">
          Group
          <select
            value={nSigFigs ?? ""}
            onChange={(e) => onGrouping(e.target.value ? Number(e.target.value) : null)}
            className="tnum rounded-md border border-line bg-paper px-2 py-[3px] text-heading"
          >
            {groupingOptions(reference).map((o) => (
              <option key={o.nSigFigs ?? "full"} value={o.nSigFigs ?? ""}>{o.tick}</option>
            ))}
          </select>
        </label>
        <div className="flex overflow-hidden rounded-md border border-line text-[0.85rem]" role="group" aria-label="Size unit">
          {(["base", "usd"] as const).map((u) => (
            <button key={u} onClick={() => setUnit(u)} aria-pressed={unit === u} className={cn("px-3 py-[3px]", unit === u ? "bg-accent text-on-accent" : "text-muted hover:bg-subtle")}>
              {u === "usd" ? "USD" : coin}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 px-2 pb-1 text-[0.8rem] font-semibold text-faint">
        <span>Price</span>
        <span className="text-right">Size {usd ? "USD" : coin}</span>
        <span className="text-right">Total</span>
      </div>

      {book && stats ? (
        <>
          <div aria-label="Asks, offers to sell">
            {[...asks].reverse().map((l) => (
              <Row key={l.px} price={formatPrice(l.px, reference)} size={fmtSize(l.size, usd)} total={fmtSize(l.total, usd)} share={l.total / maxTotal} side="ask" />
            ))}
          </div>
          <div className="my-1 grid grid-cols-3 border-y border-divider bg-panel px-2 py-1 text-[0.86rem]">
            <span className="font-semibold text-faint">Spread</span>
            <span className="tnum text-right text-heading">{formatPrice(stats.spread, reference)}</span>
            <span className="tnum text-right text-heading">{stats.spreadBps.toFixed(2)} bps</span>
          </div>
          <div aria-label="Bids, offers to buy">
            {bids.map((l) => (
              <Row key={l.px} price={formatPrice(l.px, reference)} size={fmtSize(l.size, usd)} total={fmtSize(l.total, usd)} share={l.total / maxTotal} side="bid" />
            ))}
          </div>
          <SplitBar leftLabel="Bids" rightLabel="Asks" left={bidShare} className="mt-3" />
        </>
      ) : (
        <div className="flex h-[400px] items-center justify-center text-muted">Waiting for the order book…</div>
      )}
    </div>
  );
}

function Row({ price, size, total, share, side }: { price: string; size: string; total: string; share: number; side: "bid" | "ask" }) {
  return (
    <div className="relative grid grid-cols-3 px-2 py-[2px] text-[0.92rem] leading-[1.3]">
      <div
        aria-hidden
        className={cn("absolute inset-y-[1px] right-0 rounded-l-[3px] transition-[width] duration-200", side === "bid" ? "bg-positive-bg" : "bg-negative-bg")}
        style={{ width: `${share * 100}%` }}
      />
      <span className={cn("tnum relative", side === "bid" ? "text-positive" : "text-negative")}>{price}</span>
      <span className="tnum relative text-right text-ink">{size}</span>
      <span className="tnum relative text-right text-muted">{total}</span>
    </div>
  );
}

/** A two-part share bar. The labels carry the split, so colour is never alone. */
export function SplitBar({ leftLabel, rightLabel, left, className }: { leftLabel: string; rightLabel: string; left: number; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2 text-[0.85rem]", className)}>
      <span className="tnum whitespace-nowrap text-ink">{leftLabel} {Math.round(left * 100)}%</span>
      <div className="flex h-2 flex-1 gap-[2px]" role="img" aria-label={`${leftLabel} ${Math.round(left * 100)} percent, ${rightLabel} ${Math.round((1 - left) * 100)} percent`}>
        <div className="rounded-l-full bg-chart-positive transition-[width] duration-300" style={{ width: `${left * 100}%` }} />
        <div className="flex-1 rounded-r-full bg-chart-negative" />
      </div>
      <span className="tnum whitespace-nowrap text-ink">{Math.round((1 - left) * 100)}% {rightLabel}</span>
    </div>
  );
}

export function TradeTape({ coin, trades }: { coin: string; trades: Trade[] }) {
  const buyUsd = trades.filter((t) => t.side === "buy").reduce((s, t) => s + t.px * t.sz, 0);
  const sellUsd = trades.filter((t) => t.side === "sell").reduce((s, t) => s + t.px * t.sz, 0);
  const total = buyUsd + sellUsd;
  const reference = trades[0]?.px ?? 1;
  return (
    <div>
      {total > 0 ? <SplitBar leftLabel="Bought" rightLabel="Sold" left={buyUsd / total} className="mb-3" /> : null}
      <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-x-3 px-2 pb-1 text-[0.8rem] font-semibold text-faint">
        <span>Side</span>
        <span className="text-right">Price</span>
        <span className="text-right">Size {coin}</span>
        <span className="w-[4.5rem] text-right">Time</span>
      </div>
      <div className="h-[340px] overflow-y-auto">
        {trades.length === 0 ? <p className="px-2 py-6 text-muted">Waiting for trades…</p> : null}
        {trades.map((t) => (
          <div key={t.id} className="trade-flash grid grid-cols-[1fr_1fr_1fr_auto] gap-x-3 px-2 py-[2px] text-[0.92rem]">
            <span className={t.side === "buy" ? "text-positive" : "text-negative"}>{t.side === "buy" ? "Buy" : "Sell"}</span>
            <span className="tnum text-right text-ink">{formatPrice(t.px, reference)}</span>
            <span className="tnum text-right text-ink">{fmtSize(t.sz, false)}</span>
            <span className="tnum w-[4.5rem] text-right text-faint">{new Date(t.time).toLocaleTimeString("en-US", { hour12: false })}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
