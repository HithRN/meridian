"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Eyebrow } from "@/components/ui/primitives";
import { formatCompact, formatPrice } from "@/core/market/book";
import type { MarketSummary } from "@/core/market/summary";
import { useAssetContext, useCandles } from "@/hooks/useMarket";
import { cn } from "@/lib/cn";

/* ------------------------------------------------------------------- ask box */

const PROMPTS = ["Is SOL in a real uptrend over the last 30 days?", "Is funding on HYPE crowded?", "How much would a $1M SOL order cost right now?", "Does Solana MEV rise when SOL gets more volatile?"];

export function AskTheMarket() {
  const router = useRouter();
  const [q, setQ] = React.useState("");
  const go = (question: string) => {
    if (question.trim().length >= 4) router.push(`/research?q=${encodeURIComponent(question.trim())}`);
  };
  return (
    <div className="mt-7 max-w-2xl">
      <form
        className="flex overflow-hidden rounded-lg border border-line-strong bg-paper shadow-[0_2px_10px_rgba(24,54,80,0.06)] transition-colors focus-within:border-accent"
        onSubmit={(e) => {
          e.preventDefault();
          go(q);
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ask anything about the market right now"
          aria-label="Ask a question about the market"
          className="min-w-0 flex-1 bg-transparent px-4 py-3 text-[1.05rem] text-ink outline-none placeholder:text-faint"
        />
        <button type="submit" disabled={q.trim().length < 4} className="bg-accent px-5 text-[1rem] font-semibold text-on-accent transition-opacity disabled:opacity-40">Research</button>
      </form>
      <div className="mt-3 flex flex-wrap gap-2">
        {PROMPTS.map((p) => (
          <button key={p} onClick={() => go(p)} className="rounded-full border border-line bg-panel px-3 py-[3px] text-[0.86rem] text-muted transition-colors hover:border-accent hover:bg-accent-soft hover:text-heading">
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- live tiles */

function Sparkline({ values, rising }: { values: number[]; rising: boolean }) {
  if (values.length < 2) return <div className="h-9" />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const points = values.map((v, i) => `${(i / (values.length - 1)) * 100},${max > min ? 34 - ((v - min) / (max - min)) * 30 : 18}`).join(" ");
  return (
    <svg viewBox="0 0 100 36" preserveAspectRatio="none" className="mt-2 h-9 w-full" aria-hidden>
      <polyline points={points} fill="none" stroke={rising ? "var(--color-chart-positive)" : "var(--color-chart-negative)"} strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

function LiveTile({ initial }: { initial: MarketSummary }) {
  const { coin } = initial;
  const ctx = useAssetContext(coin);
  const { candles } = useCandles(coin, "1h", 48);
  const price = ctx?.mark ?? initial.price;
  const change = ctx && ctx.prevDay > 0 ? ctx.mark / ctx.prevDay - 1 : initial.change;
  const volume = ctx?.dayVolumeUsd ?? initial.volumeUsd;

  // Tint the price briefly in the direction of each change.
  const [tick, setTick] = React.useState<{ dir: "up" | "down"; at: number } | null>(null);
  const last = React.useRef(price);
  React.useEffect(() => {
    if (price === last.current) return;
    const dir = price > last.current ? "up" : "down";
    last.current = price;
    const timer = setTimeout(() => setTick({ dir, at: price }), 0);
    return () => clearTimeout(timer);
  }, [price]);

  return (
    <Link href={`/markets?coin=${coin}`} className="group bg-paper px-5 py-4 transition-colors hover:bg-selected">
      <div className="flex items-center justify-between">
        <Eyebrow>{coin} perpetual</Eyebrow>
        <span className="text-[0.84rem] text-link opacity-0 transition-opacity group-hover:opacity-100">Open →</span>
      </div>
      <div key={tick?.at} className={cn("tnum mt-1 rounded-sm text-[1.3rem] font-semibold text-heading", tick?.dir === "up" && "tick-up", tick?.dir === "down" && "tick-down")}>{formatPrice(price)}</div>
      <div className="tnum text-[0.88rem]">
        <span className={change >= 0 ? "text-positive" : "text-negative"}>{change >= 0 ? "+" : ""}{(change * 100).toFixed(2)}%</span>
        <span className="text-faint"> · ${formatCompact(volume)} 24h</span>
      </div>
      <Sparkline values={candles.slice(-48).map((c) => c.c)} rising={change >= 0} />
    </Link>
  );
}

/** Starts from the server's prices, then keeps moving with the live feed. */
export function LiveTiles({ markets }: { markets: MarketSummary[] }) {
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line md:grid-cols-4">
      {markets.map((m) => <LiveTile key={m.coin} initial={m} />)}
    </div>
  );
}

/* ----------------------------------------------------------- workflow stepper */

const STEPS: Array<{ title: string; body: string; example: string }> = [
  { title: "Plan the research", body: "Your question becomes a written plan: what will be tested, on which data and how success is judged, before any result exists.", example: "“Test 24-hour momentum on SOL, three models, walk-forward, after costs.”" },
  { title: "Validate the data", body: "Gaps, duplicates and bad prices are checked and reported, and the data is fingerprinted so the run can be repeated exactly.", example: "A dataset with missing bars is flagged rather than quietly used." },
  { title: "Define features & hypothesis", body: "Inputs are built only from information available at that moment, so no model can see the future.", example: "A signal at 10:00 uses data up to 10:00 and trades from 11:00." },
  { title: "Train & evaluate walk-forward", body: "Models are tested on later data they never saw, repeatedly, and always against a simple baseline.", example: "Train on months 1 to 6, test on month 7, then roll forward." },
  { title: "Independent critique", body: "A separate critic tries to break the result: overfitting, cost sensitivity, too few trades or a fragile edge.", example: "A high Sharpe from a handful of trades is called out, not celebrated." },
  { title: "Evidence report", body: "The conclusion is written last, with every figure linked to the tool call that produced it.", example: "If the critic finds a serious flaw, the report says so plainly." },
];

export function WorkflowExplorer() {
  const [active, setActive] = React.useState(0);
  const step = STEPS[active];
  return (
    <div className="mt-6">
      <ol className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-6">
        {STEPS.map((s, i) => (
          <li key={s.title}>
            <button
              onClick={() => setActive(i)}
              onMouseEnter={() => setActive(i)}
              aria-pressed={active === i}
              className={cn("h-full w-full rounded-lg border px-4 py-3 text-left transition-[border-color,background-color,transform] duration-150", active === i ? "-translate-y-[2px] border-accent bg-selected" : "border-line bg-panel hover:border-line-strong")}
            >
              <div className="tnum text-[0.75rem] font-semibold text-teal">{String(i + 1).padStart(2, "0")}</div>
              <div className="mt-1 text-[0.88rem] font-medium leading-snug text-heading">{s.title}</div>
            </button>
          </li>
        ))}
      </ol>
      <div key={active} className="fade-up mt-3 grid grid-cols-1 gap-4 rounded-lg border border-line bg-paper px-5 py-4 md:grid-cols-[2fr_1fr]">
        <p className="text-[1rem] leading-relaxed text-ink">{step.body}</p>
        <p className="border-divider text-[0.95rem] italic leading-relaxed text-muted md:border-l md:pl-4">{step.example}</p>
      </div>
      <div className="mt-4">
        <Link href="/research#lab"><Button variant="secondary">Try it on a hypothesis →</Button></Link>
      </div>
    </div>
  );
}
