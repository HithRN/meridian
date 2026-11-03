import Link from "next/link";
import { Eyebrow, Badge, Button } from "@/components/ui/primitives";
import { fetchStakePoolStats, fetchTipFloor } from "@/core/solana/live";
import { LAMPORTS_PER_SOL } from "@/core/solana/tips";

export const revalidate = 60;

const CAPABILITIES = ["Multi-agent research", "Reproducible experiments", "Leakage-aware evaluation", "Auditable execution"];

const OUTCOMES: Array<{ k: string; title: string; body: string; accent: string }> = [
  {
    k: "What it does",
    title: "Turns a hypothesis into an experiment",
    body: "Describe a trading idea in plain language. Agents plan it, validate the data, train and evaluate models walk-forward, and backtest with next-bar execution and explicit costs.",
    accent: "var(--color-mod-research)",
  },
  {
    k: "Who it is for",
    title: "Quant researchers and ML engineers",
    body: "Anyone who needs to show how a result was obtained, not only the headline number, and to reproduce it months later from a pinned dataset hash and seed.",
    accent: "var(--color-mod-experiments)",
  },
  {
    k: "What you get",
    title: "An evidence report, not a chat log",
    body: "Methodology and data provenance, performance with risk and confidence intervals, an independent critic's objections, and every figure linked to the tool call behind it.",
    accent: "var(--color-mod-models)",
  },
];

const PRINCIPLES = [
  "AI proposes and coordinates.",
  "Deterministic tools calculate.",
  "Independent evaluation challenges the results.",
  "Every conclusion has traceable evidence.",
];

const WORKFLOW = ["Plan the research", "Validate the data", "Define features & hypothesis", "Train & evaluate walk-forward", "Independent critique", "Evidence report"];

const VERTICAL: Array<{ href: string; title: string; body: string; accent: string }> = [
  { href: "/jito", title: "Jito Lab", body: "Live tip floor and a calibrated bundle-tip advisor, validated walk-forward.", accent: "var(--color-mod-jito)" },
  { href: "/ai", title: "Explainable AI", body: "Will a bundle land, and why? Exact Shapley values and counterfactual tips.", accent: "var(--color-mod-agents)" },
  { href: "/copilot", title: "AI Copilot", body: "Ask in English or Japanese; every answer shows its tool calls.", accent: "var(--color-mod-agents)" },
];

function Band({ bg, children, className }: { bg: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={"px-6 py-14 md:px-10 " + (className ?? "")} style={{ background: bg }}>
      <div className="mx-auto max-w-6xl">{children}</div>
    </section>
  );
}

export default async function OverviewPage() {
  const [tip, pool] = await Promise.all([fetchTipFloor(), fetchStakePoolStats()]);
  const lamports = (sol: number) => Math.round(sol * LAMPORTS_PER_SOL).toLocaleString("en-US");
  const live = tip.source === "live" && pool.source === "live";

  const pulse: Array<{ k: string; v: string }> = [
    { k: "JitoSOL APY", v: `${(pool.data.apy * 100).toFixed(2)}%` },
    { k: "Tip floor p50", v: `${lamports(tip.data.p50)} lamports` },
    { k: "Tip floor p95", v: `${lamports(tip.data.p95)} lamports` },
    { k: "Pool TVL", v: `${(pool.data.tvlSol / 1e6).toFixed(2)}M SOL` },
  ];

  return (
    <>
      {/* Hero — white, deep navy heading, subtle blue glow */}
      <header
        className="border-b border-line px-6 pb-14 pt-14 md:px-10 md:pt-20"
        style={{
          background:
            "radial-gradient(ellipse 60% 70% at 85% 10%, rgba(71,123,165,0.12), transparent 70%), radial-gradient(ellipse 40% 50% at 95% 80%, rgba(52,127,120,0.07), transparent 70%), #ffffff",
        }}
      >
        <div className="mx-auto max-w-6xl">
          <Eyebrow>Meridian · Quantitative research platform</Eyebrow>
          <h1 className="mt-4 max-w-3xl text-[2.5rem] font-semibold leading-[1.1] tracking-tight md:text-[2.9rem]">
            Research with clarity. Decisions with confidence.
          </h1>
          <p className="mt-5 max-w-2xl text-[1.05rem] leading-relaxed text-muted">
            From research hypothesis to reproducible evidence. An intelligent, transparent quantitative research workspace that coordinates
            specialised agents, runs deterministic experiments, evaluates strategies under explicit execution and cost assumptions, and
            produces fully traceable research reports.
          </p>
          <ul className="mt-6 flex flex-wrap gap-2">
            {CAPABILITIES.map((c) => (
              <li key={c} className="rounded-full border border-line bg-panel px-3 py-1 text-[0.8rem] text-ink">
                {c}
              </li>
            ))}
          </ul>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/research"><Button>Explore a research run →</Button></Link>
            <Link href="/experiments"><Button variant="secondary">Browse experiments</Button></Link>
            <span className="ml-1 flex flex-wrap gap-2">
              <Badge variant="info">Synthetic-data demo</Badge>
              <Badge variant="neutral">No real-money execution</Badge>
            </span>
          </div>
        </div>
      </header>

      {/* Features — blue-white background, white cards */}
      <Band bg="var(--color-canvas)">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {OUTCOMES.map((o) => (
            <div key={o.k} className="rounded-lg border border-line bg-paper p-6 shadow-[0_1px_2px_rgba(24,54,80,0.04)]">
              <span className="block h-1 w-8 rounded-full" style={{ background: o.accent }} />
              <Eyebrow className="mt-4">{o.k}</Eyebrow>
              <h2 className="mt-2 text-[1.05rem] font-semibold leading-snug tracking-tight">{o.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">{o.body}</p>
            </div>
          ))}
        </div>
      </Band>

      {/* Principles — light blue-grey, navy and teal */}
      <Band bg="var(--color-sidebar)" className="border-y border-line">
        <Eyebrow>How Meridian earns trust</Eyebrow>
        <ol className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {PRINCIPLES.map((p, i) => (
            <li key={p} className="flex gap-3">
              <span className="tnum mt-[1px] flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand text-[0.78rem] font-semibold text-white">
                {i + 1}
              </span>
              <span className="text-[1rem] font-medium leading-snug text-heading">{p}</span>
            </li>
          ))}
        </ol>
      </Band>

      {/* Research workflow — white, muted blue/teal */}
      <Band bg="#ffffff">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <Eyebrow>Research workflow</Eyebrow>
            <h2 className="mt-1 text-[1.6rem] font-semibold tracking-tight">Follow one run from plan to evidence</h2>
          </div>
          <Link href="/research" className="text-sm font-medium text-link underline-offset-2 hover:underline">Start with a sample hypothesis →</Link>
        </div>
        <ol className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          {WORKFLOW.map((w, i) => (
            <li key={w} className="rounded-lg border border-line bg-panel px-4 py-3">
              <div className="tnum text-[0.75rem] font-semibold text-teal">{String(i + 1).padStart(2, "0")}</div>
              <div className="mt-1 text-[0.88rem] font-medium leading-snug text-heading">{w}</div>
            </li>
          ))}
        </ol>
      </Band>

      {/* Specialised vertical — blue-white, white analytical cards */}
      <Band bg="var(--color-canvas)" className="border-t border-line">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <Eyebrow>Specialised vertical</Eyebrow>
            <h2 className="mt-1 text-[1.6rem] font-semibold tracking-tight">Solana · Jito research</h2>
          </div>
          <Badge variant={live ? "success" : "neutral"}>{live ? "Live · Jito public mainnet APIs" : "Bundled snapshot"}</Badge>
        </div>
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line md:grid-cols-4">
          {pulse.map((p) => (
            <div key={p.k} className="bg-paper px-5 py-4">
              <Eyebrow>{p.k}</Eyebrow>
              <div className="tnum mt-1 text-[1.1rem] font-semibold text-heading">{p.v}</div>
            </div>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
          {VERTICAL.map((v) => (
            <Link key={v.href} href={v.href} className="group rounded-lg border border-line bg-paper p-5 transition-colors hover:border-line-strong hover:bg-selected">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <span className="h-[8px] w-[8px] rounded-full" style={{ background: v.accent }} />
                  <h3 className="font-semibold">{v.title}</h3>
                </span>
                <span className="text-link transition-transform group-hover:translate-x-0.5">→</span>
              </div>
              <p className="mt-1 text-sm text-muted">{v.body}</p>
            </Link>
          ))}
        </div>
      </Band>

      {/* Trust & developers — light blue-grey, navy and sage */}
      <Band bg="var(--color-sidebar)" className="border-t border-line">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-line bg-paper p-6">
            <span className="block h-1 w-8 rounded-full bg-mod-models" />
            <Eyebrow className="mt-4">Trust & security</Eyebrow>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Read-only tools, strict schemas, an in-memory coding sandbox and labelled data sources. The threat model lists what is in
              place and what is not yet done.
            </p>
            <Link href="/security" className="mt-3 inline-block text-sm font-medium text-link underline-offset-2 hover:underline">Read the threat model →</Link>
          </div>
          <div className="rounded-lg border border-line bg-paper p-6">
            <span className="block h-1 w-8 rounded-full bg-mod-tools" />
            <Eyebrow className="mt-4">For developers</Eyebrow>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Every tool is served through a Model Context Protocol server and a REST API with strict JSON Schemas. Connect Claude or any
              MCP client in one line.
            </p>
            <Link href="/developers" className="mt-3 inline-block text-sm font-medium text-link underline-offset-2 hover:underline">Connect an MCP client →</Link>
          </div>
        </div>
      </Band>
    </>
  );
}
