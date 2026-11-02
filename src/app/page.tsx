import Link from "next/link";
import { PageBody } from "@/components/layout/PageHeader";
import { Eyebrow, Badge, Button } from "@/components/ui/primitives";
import { fetchStakePoolStats, fetchTipFloor } from "@/core/solana/live";
import { LAMPORTS_PER_SOL } from "@/core/solana/tips";

export const revalidate = 60;

const ENTRY_POINTS: Array<{ href: string; index: string; title: string; body: string; cta: string }> = [
  {
    href: "/jito",
    index: "01",
    title: "Jito Lab",
    body: "Live tip floor from Jito's block engine, a conformal bundle-tip advisor validated walk-forward, and a JitoSOL yield breakdown.",
    cta: "Open the lab",
  },
  {
    href: "/ai",
    index: "02",
    title: "Explainable AI",
    body: "Will this bundle land, and why? Boosted trees and a neural net trained from scratch, explained with exact Shapley values and counterfactual tips.",
    cta: "Explain a bundle",
  },
  {
    href: "/copilot",
    index: "03",
    title: "AI Copilot",
    body: "Ask in English or Japanese. Claude picks the tools, the tools compute the numbers, and every figure links back to the call that produced it.",
    cta: "Ask a question",
  },
  {
    href: "/research",
    index: "04",
    title: "Quant research",
    body: "Specialised agents plan, test and try to falsify a trading hypothesis, then write an evidence report. Now with a SOL/USDC dataset.",
    cta: "Start a run",
  },
];

export default async function OverviewPage() {
  const [tip, pool] = await Promise.all([fetchTipFloor(), fetchStakePoolStats()]);
  const lamports = (sol: number) => Math.round(sol * LAMPORTS_PER_SOL).toLocaleString("en-US");
  const live = tip.source === "live" && pool.source === "live";

  const pulse: Array<{ k: string; v: string; sub: string }> = [
    { k: "JitoSOL APY", v: `${(pool.data.apy * 100).toFixed(2)}%`, sub: `${pool.data.numValidators} validators` },
    { k: "Tip floor · p50", v: lamports(tip.data.p50), sub: "lamports per landed bundle" },
    { k: "Tip floor · p95", v: lamports(tip.data.p95), sub: "lamports to outbid 95%" },
    { k: "Pool TVL", v: `${(pool.data.tvlSol / 1e6).toFixed(2)}M`, sub: "SOL staked" },
  ];

  return (
    <>
      <header className="border-b border-ink px-6 pb-10 pt-12 md:px-10 md:pt-20">
        <div className="mx-auto max-w-6xl">
          <Eyebrow>00 — AI research desk for Solana&rsquo;s MEV economy</Eyebrow>
          <h1 className="mt-4 max-w-4xl text-5xl leading-[1.02] tracking-tight md:text-7xl">
            AI that researches Solana&rsquo;s MEV economy and shows its working.
          </h1>
          <p className="mt-6 max-w-2xl text-xl text-muted">
            Machine-learning models that predict whether a Jito bundle lands and explain why, plus
            Claude on top of audited tools. Every number traces back to a model or a tool call, and
            every explanation is checked against ground truth.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/copilot"><Button>Ask the AI copilot →</Button></Link>
            <Link href="/ai"><Button variant="secondary">Explain a bundle</Button></Link>
            <div className="ml-2 flex flex-wrap items-center gap-2">
              <Badge variant="muted">Live Jito mainnet</Badge>
              <Badge variant="muted">English · 日本語</Badge>
              <Badge variant="muted">Explainable ML</Badge>
            </div>
          </div>
        </div>
      </header>

      <PageBody>
        {/* Network pulse */}
        <section className="mb-12">
          <div className="mb-4 flex items-end justify-between gap-4 border-b border-line pb-2">
            <Eyebrow>Network pulse</Eyebrow>
            <span className="text-[0.72rem] uppercase tracking-[0.14em] text-faint">
              {live ? "● Live · Jito public API" : "Bundled snapshot · Jito API unreachable"}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-px border border-line bg-line md:grid-cols-4">
            {pulse.map((p) => (
              <div key={p.k} className="bg-paper px-5 py-5">
                <Eyebrow>{p.k}</Eyebrow>
                <div className="tnum mt-2 text-3xl leading-none">{p.v}</div>
                <div className="mt-2 text-sm text-muted">{p.sub}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Entry points */}
        <section className="mb-12 grid grid-cols-1 gap-px border border-line bg-line md:grid-cols-2 xl:grid-cols-4">
          {ENTRY_POINTS.map((e) => (
            <Link key={e.href} href={e.href} className="group flex flex-col bg-paper px-6 py-6 hover:bg-subtle">
              <span className="tnum text-[0.68rem] tracking-widest text-faint">{e.index}</span>
              <h2 className="mt-2 text-2xl leading-none">{e.title}</h2>
              <p className="mt-3 flex-1 text-sm text-muted">{e.body}</p>
              <span className="mt-5 text-sm underline-offset-4 group-hover:underline">{e.cta} →</span>
            </Link>
          ))}
        </section>

        <p className="max-w-3xl text-sm text-muted">
          Curious how the agents, guardrails and tools fit together?{" "}
          <Link href="/about" className="underline underline-offset-2">See how it works</Link>. Research
          results use bundled synthetic market data; nothing here is investment advice.
        </p>
      </PageBody>
    </>
  );
}
