import Link from "next/link";
import { Badge, Eyebrow } from "@/components/ui/primitives";
import type { CoverageRow, Regime } from "@/core/solana/tips";

export interface EcosystemFitData {
  /** Walk-forward row for the p95 / 80% case. */
  advisor: Pick<CoverageRow, "coverage" | "coverageNaive" | "coverageHot" | "coverageHotGlobal" | "medianOverpay">;
  regime: Regime;
  regimeSource: "live" | "bundled-history";
  apy: number;
  mevApy: number;
  validators: number;
  poolSource: "live" | "snapshot";
  toolCount?: number;
}

const pct = (x: number, d = 0) => `${(x * 100).toFixed(d)}%`;

/**
 * The questions different parts of the Jito ecosystem face, and what Meridian
 * answers for each, with a measured figure where one exists.
 */
export function EcosystemFit({ data }: { data: EcosystemFitData }) {
  const a = data.advisor;
  const rows: Array<{ who: string; question: string; answer: React.ReactNode; evidence: React.ReactNode; href: string; cta: string }> = [
    {
      who: "Searchers",
      question: "What should this bundle tip?",
      answer:
        "A tip that is too low loses the auction; one that is too high gives the edge away. The tip advisor forecasts next-hour tips with a stated confidence instead of copying the last value.",
      evidence: (
        <>
          Re-using last hour&rsquo;s p95 clears it {pct(a.coverageNaive)} of the time. The advisor holds {pct(a.coverage)} at an 80%
          target, and {pct(a.coverageHot)} in congested hours, where one global estimate drops to {pct(a.coverageHotGlobal)}.
        </>
      ),
      href: "/jito",
      cta: "Tip advisor",
    },
    {
      who: "Block engine and searcher support",
      question: "Why did this bundle not land?",
      answer:
        "Exact Shapley values split a prediction into the auction and everything else: state drift, competition for the same accounts, slots to the next Jito leader. When the tip is not the bottleneck, the counterfactual says so rather than suggesting a higher tip.",
      evidence: <>Explanations are scored against the simulator&rsquo;s known mechanism before they are shown.</>,
      href: "/ai",
      cta: "Explainable AI",
    },
    {
      who: "JitoSOL stakers and validators",
      question: "How much of the yield comes from MEV?",
      answer:
        "Stake-pool data is decomposed into staking and MEV components, so a position can be projected with and without the MEV share.",
      evidence: (
        <>
          {data.poolSource === "live" ? "Live" : "Snapshot"} pool data: {pct(data.apy, 2)} APY, of which about {pct(data.mevApy, 3)} comes
          from MEV after validator commission. At today&rsquo;s activity the yield is almost entirely staking.
        </>
      ),
      href: "/jito#yield",
      cta: "JitoSOL yield",
    },
    {
      who: "Foundation and community",
      question: "How do new builders learn MEV without guesswork?",
      answer:
        "A copilot answers in English or Japanese and cites the tool behind each figure. The same read-only tools are open to any AI agent over the Model Context Protocol.",
      evidence: (
        <>
          {data.toolCount ? `${data.toolCount} read-only tools, ` : ""}English and 日本語, every answer listing its tool calls.
        </>
      ),
      href: "/copilot",
      cta: "AI Copilot",
    },
  ];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3 text-sm text-muted">
        <span>Tip market right now:</span>
        <Badge variant={data.regime === "hot" ? "warning" : data.regime === "calm" ? "success" : "info"}>{data.regime}</Badge>
        <span className="text-faint">
          {data.regimeSource === "live" ? "from the live tip floor" : "from bundled history"}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {rows.map((r) => (
          <div key={r.who} className="flex flex-col rounded-lg border border-line bg-paper p-5">
            <Eyebrow>{r.who}</Eyebrow>
            <h3 className="mt-1 text-[1.1rem] font-semibold leading-snug">{r.question}</h3>
            <p className="mt-2 text-[0.95rem] leading-relaxed text-muted">{r.answer}</p>
            <p className="mt-3 rounded-md bg-panel px-3 py-2 text-[0.9rem] leading-relaxed text-ink">{r.evidence}</p>
            <Link href={r.href} className="mt-3 text-sm font-medium text-link underline-offset-2 hover:underline">
              {r.cta} →
            </Link>
          </div>
        ))}
      </div>
      <a href="/intel" className="mt-5 inline-block text-[0.95rem] font-medium text-link underline-offset-2 hover:underline">
        Open live market intelligence: the tip auction, MEV value flow and validator economics →
      </a>
      <p className="mt-4 max-w-3xl text-[0.9rem] text-faint">
        On mainnet the same pipeline would calibrate on the block engine&rsquo;s landed and dropped bundle records instead of the bundled
        simulator and calibration history.
      </p>
    </div>
  );
}

/** Pick the p95 / 80% walk-forward row used as the headline evidence. */
export function headlineRow(rows: CoverageRow[]): EcosystemFitData["advisor"] {
  const r = rows.find((x) => x.level === 95 && x.confidence === 0.8) ?? rows[0];
  return {
    coverage: r.coverage,
    coverageNaive: r.coverageNaive,
    coverageHot: r.coverageHot,
    coverageHotGlobal: r.coverageHotGlobal,
    medianOverpay: r.medianOverpay,
  };
}
