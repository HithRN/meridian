"use client";

import * as React from "react";
import Link from "next/link";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge, Card, CardBody, CardHeader, Eyebrow } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { bookStats, depthCurve, executionCost, formatCompact, formatPrice, mergeDepth, type ExecutionCost } from "@/core/market/book";
import { useAssetContext, useBook, useDeepBook, useFeedStatus, useTrades, type LiveBook } from "@/hooks/useMarket";
import { CandleChart } from "@/components/market/CandleChart";
import { OrderBook, TradeTape } from "@/components/market/OrderBook";

const MARKETS: Array<{ coin: string; name: string }> = [
  { coin: "SOL", name: "Solana" },
  { coin: "JTO", name: "Jito" },
  { coin: "BTC", name: "Bitcoin" },
  { coin: "ETH", name: "Ethereum" },
  { coin: "HYPE", name: "Hyperliquid" },
  { coin: "JUP", name: "Jupiter" },
];

type Panel = "chart" | "book" | "trades";

export function MarketTerminal() {
  const [coin, setCoin] = React.useState("SOL");
  // Open the market named in the link, once the page has loaded in the browser.
  React.useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get("coin");
    if (!wanted || !MARKETS.some((m) => m.coin === wanted)) return;
    const timer = setTimeout(() => setCoin(wanted), 0);
    return () => clearTimeout(timer);
  }, []);
  const status = useFeedStatus();
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1" role="group" aria-label="Market">
          {MARKETS.map((m) => (
            <button
              key={m.coin}
              onClick={() => setCoin(m.coin)}
              aria-pressed={m.coin === coin}
              title={m.name}
              className={cn(
                "rounded-md border px-3 py-[5px] text-[0.95rem] transition-colors",
                m.coin === coin ? "border-accent bg-accent font-semibold text-on-accent" : "border-line bg-paper text-muted hover:border-line-strong hover:text-heading",
              )}
            >
              {m.coin}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={`/research?q=${encodeURIComponent(`How is ${coin} behaving right now: trend, volatility and funding?`)}`}
            className="text-[0.95rem] font-medium text-link underline-offset-2 hover:underline"
          >
            Research {coin} now →
          </Link>
          <Badge variant={status === "open" ? "success" : status === "connecting" ? "neutral" : "warning"}>
            {status === "open" ? "Live stream" : status === "connecting" ? "Connecting" : "Reconnecting, refreshing every 3 s"}
          </Badge>
        </div>
      </div>
      {/* Remounting on market change clears every panel, so no stale prices show. */}
      <Market key={coin} coin={coin} />
    </div>
  );
}

function Market({ coin }: { coin: string }) {
  const [nSigFigs, setNSigFigs] = React.useState<number | null>(null);
  const [panel, setPanel] = React.useState<Panel>("chart");
  const book = useBook(coin, nSigFigs);
  const deep = useDeepBook(coin);
  const trades = useTrades(coin);

  return (
    <div className="space-y-6">
      <StatStrip coin={coin} lastTradeSide={trades[0]?.side} lastPx={trades[0]?.px} />

      {/* On phones one panel shows at a time; on desktop they sit side by side. */}
      <div className="flex overflow-hidden rounded-md border border-line lg:hidden" role="group" aria-label="Panel">
        {(["chart", "book", "trades"] as const).map((p) => (
          <button key={p} onClick={() => setPanel(p)} aria-pressed={panel === p} className={cn("flex-1 py-2 text-[0.95rem] capitalize", panel === p ? "bg-accent text-on-accent" : "bg-paper text-muted")}>
            {p}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_330px]">
        <Card className={cn("min-w-0", panel !== "chart" && "hidden lg:block")}>
          <CardBody>
            <CandleChart coin={coin} />
          </CardBody>
        </Card>
        <Card className={cn("min-w-0", panel !== "book" && "hidden lg:block")}>
          <CardHeader title="Order book" />
          <CardBody>
            <OrderBook coin={coin} book={book} nSigFigs={nSigFigs} onGrouping={setNSigFigs} />
          </CardBody>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_330px]">
        <Card className="min-w-0">
          <CardHeader title="What would a large order cost?" eyebrow="A market order sweeping the live book, before fees" />
          <CardBody>
            <CostPanel coin={coin} book={book} deep={deep} />
          </CardBody>
        </Card>
        <Card className={cn("order-first min-w-0 lg:order-none", panel !== "trades" && "hidden lg:block")}>
          <CardHeader title="Latest trades" />
          <CardBody>
            <TradeTape coin={coin} trades={trades} />
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="Market depth" eyebrow="Total value waiting to trade at each price" />
        <CardBody>
          <DepthChart book={book} deep={deep} />
        </CardBody>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------- stats */

function StatStrip({ coin, lastTradeSide, lastPx }: { coin: string; lastTradeSide?: "buy" | "sell"; lastPx?: number }) {
  const ctx = useAssetContext(coin);
  const px = lastPx ?? ctx?.mark;
  const change = ctx && px && ctx.prevDay > 0 ? px / ctx.prevDay - 1 : null;
  const premium = ctx && ctx.oracle > 0 ? (ctx.mark / ctx.oracle - 1) * 1e4 : null;
  const tiles: Array<{ k: string; v: React.ReactNode; sub?: string }> = [
    {
      k: "24h change",
      v: change === null ? "…" : <span className={change >= 0 ? "text-positive" : "text-negative"}>{change >= 0 ? "+" : ""}{(change * 100).toFixed(2)}%</span>,
    },
    { k: "24h volume", v: ctx ? `$${formatCompact(ctx.dayVolumeUsd)}` : "…" },
    { k: "Open interest", v: ctx && px ? `$${formatCompact(ctx.openInterest * px)}` : "…", sub: ctx ? `${formatCompact(ctx.openInterest)} ${coin}` : undefined },
    { k: "Funding, hourly", v: ctx ? `${(ctx.funding * 100).toFixed(4)}%` : "…", sub: ctx ? `${(ctx.funding * 24 * 365 * 100).toFixed(1)}% annualised` : undefined },
    { k: "Mark vs oracle", v: premium === null ? "…" : `${premium >= 0 ? "+" : ""}${premium.toFixed(1)} bps` },
  ];
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line md:grid-cols-3 lg:grid-cols-6">
      <div className="col-span-2 bg-paper px-5 py-3 md:col-span-1">
        <Eyebrow>{coin} perpetual</Eyebrow>
        <div className={cn("tnum mt-1 text-[1.6rem] font-semibold leading-tight", lastTradeSide === "buy" ? "text-positive" : lastTradeSide === "sell" ? "text-negative" : "text-heading")}>
          {px ? formatPrice(px) : "…"}
        </div>
      </div>
      {tiles.map((t, i) => (
        <div key={t.k} className={cn("bg-paper px-5 py-3", i === tiles.length - 1 && "col-span-2 md:col-span-1")}>
          <Eyebrow>{t.k}</Eyebrow>
          <div className="tnum mt-1 text-[1.1rem] font-semibold text-heading">{t.v}</div>
          {t.sub ? <div className="tnum text-[0.8rem] text-faint">{t.sub}</div> : null}
        </div>
      ))}
    </div>
  );
}

/* --------------------------------------------------------- execution cost */

const SIZES = [10_000, 50_000, 100_000, 1_000_000];

function useDepthLevels(book: LiveBook | null, deep: LiveBook | null) {
  return React.useMemo(() => {
    if (!book) return null;
    const stats = bookStats(book.bids, book.asks);
    if (!stats) return null;
    return {
      mid: stats.mid,
      bids: mergeDepth(book.bids, deep?.bids ?? [], "bid"),
      asks: mergeDepth(book.asks, deep?.asks ?? [], "ask"),
    };
  }, [book, deep]);
}

function CostCell({ cost }: { cost: ExecutionCost | null }) {
  if (!cost) return <span className="text-faint">…</span>;
  if (!cost.complete) return <span className="text-warning">More than the visible ${formatCompact(cost.filledUsd)}</span>;
  return (
    <span className="tnum text-ink">
      {cost.costBps.toFixed(2)} bps <span className="text-faint">(${cost.costUsd.toLocaleString("en-US", { maximumFractionDigits: cost.costUsd < 10 ? 2 : 0 })})</span>
    </span>
  );
}

function CostPanel({ coin, book, deep }: { coin: string; book: LiveBook | null; deep: LiveBook | null }) {
  const [custom, setCustom] = React.useState(250_000);
  const depth = useDepthLevels(book, deep);
  const sizes = [...SIZES, custom].filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => a - b);
  const headline = depth ? executionCost(depth.bids, 1_000_000, depth.mid) : null;
  return (
    <div>
      <p className="mb-4 text-[1rem] text-ink">
        {headline?.complete ? (
          <>
            Selling <strong>$1M of {coin}</strong> right now would cost about <strong>{headline.costBps.toFixed(1)} bps</strong> against the
            mid price, or roughly <strong>${Math.round(headline.costUsd).toLocaleString("en-US")}</strong>.
          </>
        ) : headline ? (
          <>
            A <strong>$1M sale of {coin}</strong> is larger than the <strong>${formatCompact(headline.filledUsd)}</strong> of bids visible
            near the price, so it would move the market noticeably.
          </>
        ) : (
          "Reading the live book…"
        )}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-[0.92rem]">
          <thead>
            <tr className="border-b border-line text-[0.82rem] text-faint">
              <th className="py-2 pr-4 font-semibold">Order size</th>
              <th className="py-2 pr-4 font-semibold">Cost to buy</th>
              <th className="py-2 font-semibold">Cost to sell</th>
            </tr>
          </thead>
          <tbody>
            {sizes.map((s) => (
              <tr key={s} className="border-b border-divider">
                <td className="tnum py-2 pr-4 font-semibold text-heading">${s.toLocaleString("en-US")}</td>
                <td className="py-2 pr-4"><CostCell cost={depth ? executionCost(depth.asks, s, depth.mid) : null} /></td>
                <td className="py-2"><CostCell cost={depth ? executionCost(depth.bids, s, depth.mid) : null} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <label className="mt-4 flex flex-wrap items-center gap-3 text-[0.92rem] text-muted">
        Try your own size, in USD
        <input
          type="number"
          min={100}
          step={1000}
          value={custom}
          onChange={(e) => setCustom(Math.max(100, Number(e.target.value) || 100))}
          className="tnum w-36 rounded-md border border-line-strong bg-paper px-3 py-[5px] text-heading"
        />
      </label>
      <p className="mt-3 text-[0.85rem] text-faint">
        Measured from the orders resting in the book at this moment. It shows how much size the market can absorb, and it does not
        include exchange fees or other traders reacting.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------ depth chart */

const AXIS = { fontFamily: '"Times New Roman", Times, serif', fontSize: 12, fill: "var(--color-muted)" };

function DepthChart({ book, deep }: { book: LiveBook | null; deep: LiveBook | null }) {
  const depth = useDepthLevels(book, deep);
  if (!depth) return <div className="flex h-[260px] items-center justify-center text-muted">Waiting for the order book…</div>;
  const data = depthCurve(depth.bids, depth.asks, depth.mid, 0.015);
  const bidTotal = Math.max(0, ...data.map((p) => p.bid ?? 0));
  const askTotal = Math.max(0, ...data.map((p) => p.ask ?? 0));
  return (
    <div>
      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={data} margin={{ top: 12, right: 12, bottom: 4, left: 4 }}>
          <CartesianGrid stroke="var(--color-chart-grid)" vertical={false} />
          <XAxis dataKey="px" type="number" domain={["dataMin", "dataMax"]} tickFormatter={(v) => formatPrice(Number(v), depth.mid)} tick={AXIS} stroke="var(--color-divider)" minTickGap={60} />
          <YAxis tickFormatter={(v) => `$${formatCompact(Number(v))}`} tick={AXIS} stroke="var(--color-divider)" width={64} />
          <ReferenceLine x={depth.mid} stroke="var(--color-chart-benchmark)" strokeDasharray="3 3" />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as { px: number; bid?: number; ask?: number };
              const distance = ((p.px / depth.mid - 1) * 100).toFixed(2);
              return (
                <div className="rounded-md border border-line bg-paper px-3 py-2 text-[0.85rem] shadow-sm">
                  <div className="font-semibold">{formatPrice(p.px, depth.mid)} ({Number(distance) >= 0 ? "+" : ""}{distance}%)</div>
                  <div>{p.bid !== undefined ? `$${formatCompact(p.bid)} of bids down to here` : `$${formatCompact(p.ask ?? 0)} of asks up to here`}</div>
                </div>
              );
            }}
          />
          <Area type="stepAfter" dataKey="bid" stroke="var(--color-chart-positive)" strokeWidth={2} fill="var(--color-positive-bg)" isAnimationActive={false} connectNulls={false} />
          <Area type="stepBefore" dataKey="ask" stroke="var(--color-chart-negative)" strokeWidth={2} strokeDasharray="5 3" fill="var(--color-negative-bg)" isAnimationActive={false} connectNulls={false} />
        </AreaChart>
      </ResponsiveContainer>
      <div className="mt-2 flex flex-wrap gap-5 text-[0.85rem] text-muted">
        <span className="inline-flex items-center gap-2">
          <svg width="20" height="6" aria-hidden><line x1="0" y1="3" x2="20" y2="3" stroke="var(--color-chart-positive)" strokeWidth="2.5" /></svg>
          Bids, left of the mid price: ${formatCompact(bidTotal)} within 1.5%
        </span>
        <span className="inline-flex items-center gap-2">
          <svg width="20" height="6" aria-hidden><line x1="0" y1="3" x2="20" y2="3" stroke="var(--color-chart-negative)" strokeWidth="2.5" strokeDasharray="5 3" /></svg>
          Asks, right of the mid price: ${formatCompact(askTotal)} within 1.5%
        </span>
      </div>
      <p className="mt-2 text-[0.9rem] text-muted">
        The taller the walls on either side, the more money it takes to push the price that far. A thin side means price can move
        quickly in that direction.
      </p>
    </div>
  );
}
