import Link from "next/link";
import { AskTheMarket, LiveTiles, WorkflowExplorer } from "@/components/home/HomeInteractive";
import { Eyebrow, Badge, Button } from "@/components/ui/primitives";
import { fetchStakePoolStats, fetchTipFloor } from "@/core/solana/live";
import { LAMPORTS_PER_SOL, getTipAdvisor } from "@/core/solana/tips";
import { mevApyEstimate } from "@/core/solana/staking";
import { mcpTools } from "@/core/mcp/server";
import { EcosystemFit, headlineRow } from "@/components/jito/EcosystemFit";
import { fetchMarketSummary } from "@/core/market/summary";

export const revalidate = 60;

const CAPABILITIES = ["Live markets and order books", "Multi-agent research", "Reproducible experiments", "Explainable models"];

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
    title: "A report you can audit",
    body: "Methodology and data provenance, performance with risk and confidence intervals, the critic's objections, and each figure linked to the tool call that produced it.",
    accent: "var(--color-mod-models)",
  },
];

const PRINCIPLES = [
  "AI proposes and coordinates.",
  "Deterministic tools calculate.",
  "Independent evaluation challenges the results.",
  "Every conclusion has traceable evidence.",
];



function Band({ bg, children, className }: { bg: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={"px-6 py-14 md:px-10 " + (className ?? "")} style={{ background: bg }}>
      <div className="mx-auto max-w-6xl">{children}</div>
    </section>
  );
}

export default async function OverviewPage() {
  const [tip, pool, markets] = await Promise.all([fetchTipFloor(), fetchStakePoolStats(), fetchMarketSummary(["SOL", "JTO", "BTC", "ETH"])]);
  const lamports = (sol: number) => Math.round(sol * LAMPORTS_PER_SOL).toLocaleString("en-US");
  const live = tip.source === "live" && pool.source === "live";
  const advisor = getTipAdvisor();
  const now = advisor.recommend(95, 0.8, tip.source === "live" ? tip.data : null);

  const pulse: Array<{ k: string; v: string }> = [
    { k: "JitoSOL APY", v: `${(pool.data.apy * 100).toFixed(2)}%` },
    { k: "Tip floor p50", v: `${lamports(tip.data.p50)} lamports` },
    { k: "Tip floor p95", v: `${lamports(tip.data.p95)} lamports` },
    { k: "Pool TVL", v: `${(pool.data.tvlSol / 1e6).toFixed(2)}M SOL` },
  ];

  return (
    <>
      {/* Hero: white, deep navy heading, subtle blue glow */}
      <header
        className="border-b border-line px-6 pb-14 pt-14 md:px-10 md:pt-20"
        style={{
          background:
            "radial-gradient(ellipse 60% 70% at 85% 10%, rgba(71,123,165,0.12), transparent 70%), radial-gradient(ellipse 40% 50% at 95% 80%, rgba(52,127,120,0.07), transparent 70%), #ffffff",
        }}
      >
        <div className="mx-auto max-w-6xl">
          <Eyebrow>Meridian · Quantitative research platform</Eyebrow>
          <h1 className="mt-4 max-w-3xl text-[2.5rem] font-semibold leading-[1.1] tracking-tight md:text-[2.875rem]">
            Research with clarity. Decisions with confidence.
          </h1>
          <p className="mt-5 max-w-2xl text-[1.05rem] leading-relaxed text-muted">
            Meridian follows live markets and turns research questions into reproducible evidence. Watch prices and order books as they
            move, then test an idea: agents plan the work, deterministic tools run the experiments under stated cost assumptions, and an
            independent critic reviews the result.
          </p>
          <ul className="mt-6 flex flex-wrap gap-2">
            {CAPABILITIES.map((c) => (
              <li key={c} className="rounded-full border border-line bg-panel px-3 py-1 text-[0.8rem] text-ink">
                {c}
              </li>
            ))}
          </ul>
          <AskTheMarket />
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Link href="/markets"><Button variant="secondary">Open live markets</Button></Link>
            <Link href="/research#lab"><Button variant="ghost">Test a hypothesis →</Button></Link>
          </div>
        </div>
      </header>

      {/* Live markets: only shown when the feed answered, so prices are never stale */}
      {markets ? (
        <Band bg="#ffffff" className="border-b border-line">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <Eyebrow>Live markets</Eyebrow>
              <h2 className="mt-1 text-[1.75rem] font-semibold tracking-tight">Watch the market, then measure it</h2>
              <p className="mt-2 max-w-2xl text-[0.98rem] text-muted">
                Live charts, order books and trades, with the cost of a large order worked out from the book as it stands.
              </p>
            </div>
            <Link href="/markets" className="text-sm font-medium text-link underline-offset-2 hover:underline">Open the terminal →</Link>
          </div>
          <LiveTiles markets={markets} />
        </Band>
      ) : null}

      {/* Features: blue-white background, white cards */}
      <Band bg="var(--color-canvas)">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {OUTCOMES.map((o) => (
            <div key={o.k} className="lift reveal rounded-lg border border-line bg-paper p-6 shadow-[0_1px_2px_rgba(24,54,80,0.04)]">
              <span className="block h-1 w-8 rounded-full" style={{ background: o.accent }} />
              <Eyebrow className="mt-4">{o.k}</Eyebrow>
              <h2 className="mt-2 text-[1.05rem] font-semibold leading-snug tracking-tight">{o.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">{o.body}</p>
            </div>
          ))}
        </div>
      </Band>

      {/* Principles: light blue-grey, navy and teal */}
      <Band bg="var(--color-sidebar)" className="border-y border-line">
        <Eyebrow>Principles</Eyebrow>
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

      {/* Research workflow: white, muted blue/teal */}
      <Band bg="#ffffff">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <Eyebrow>Research workflow</Eyebrow>
            <h2 className="mt-1 text-[1.75rem] font-semibold tracking-tight">Follow one run from plan to evidence</h2>
            <p className="mt-2 max-w-2xl text-[0.98rem] text-muted">Point at a step to see what happens there.</p>
          </div>
                  </div>
        <WorkflowExplorer />
      </Band>

      {/* Jito ecosystem: blue-white, white analytical cards */}
      <Band bg="var(--color-canvas)" className="border-t border-line">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <Eyebrow>Solana · Jito</Eyebrow>
            <h2 className="mt-1 text-[1.75rem] font-semibold tracking-tight">Where it fits in the Jito ecosystem</h2>
            <p className="mt-2 max-w-2xl text-[0.98rem] text-muted">
              The same research discipline applied to the questions searchers, stakers and the community ask about MEV every day.
            </p>
          </div>
          <Badge variant={live ? "success" : "neutral"}>{live ? "Live · Jito public mainnet APIs" : "Bundled snapshot"}</Badge>
        </div>
        <div className="mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line md:grid-cols-4">
          {pulse.map((p) => (
            <div key={p.k} className="bg-paper px-5 py-4">
              <Eyebrow>{p.k}</Eyebrow>
              <div className="tnum mt-1 text-[1.15rem] font-semibold text-heading">{p.v}</div>
            </div>
          ))}
        </div>
        <EcosystemFit
          data={{
            advisor: headlineRow(advisor.backtest.rows),
            regime: now.regime,
            regimeSource: now.anchorSource,
            apy: pool.data.apy,
            mevApy: mevApyEstimate(pool.data),
            validators: pool.data.numValidators,
            poolSource: pool.source,
            toolCount: mcpTools().length,
          }}
        />
      </Band>

      {/* Trust & developers: light blue-grey, navy and sage */}
      <Band bg="var(--color-sidebar)" className="border-t border-line">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="lift reveal rounded-lg border border-line bg-paper p-6">
            <span className="block h-1 w-8 rounded-full bg-mod-models" />
            <Eyebrow className="mt-4">Trust & security</Eyebrow>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Read-only tools, strict schemas, an in-memory coding sandbox and labelled data sources. The threat model lists what is in
              place and what is not yet done.
            </p>
            <Link href="/security" className="mt-3 inline-block text-sm font-medium text-link underline-offset-2 hover:underline">Read the threat model →</Link>
          </div>
          <div className="lift reveal rounded-lg border border-line bg-paper p-6">
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
