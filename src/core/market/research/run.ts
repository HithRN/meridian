/** Run one live market research report from a question to a finished document. */

import { fnv1a64 } from "@/core/hash";
import { ANALYSES, finalize, Skip, type AnalysisContext, type Draft } from "@/core/market/research/analyses";
import { liveFeed, ResearchData, type MarketFeedSource } from "@/core/market/research/data";
import { buildPlan } from "@/core/market/research/plan";
import { ANALYSIS_LABELS, type Finding, type MarketReport, type PlanOverrides, type TraceStep } from "@/core/market/research/types";

export const ENGINE_VERSION = "market-research-1";

/** The question cannot be answered as asked; the message is written for the reader. */
export class ResearchInputError extends Error {}

export interface RunOptions {
  question: string;
  overrides?: PlanOverrides;
  seed?: number;
  feed?: MarketFeedSource;
  now?: number;
  onStep?: (step: TraceStep) => void;
}

export async function runMarketResearch({ question, overrides, seed = 42, feed = liveFeed, now = Date.now(), onStep }: RunOptions): Promise<MarketReport> {
  const data = new ResearchData(feed, now, onStep);

  const universe = await data.step("Loaded the list of live markets", () => feed.universe(), (u) => `${u.size} markets`);
  const plan = buildPlan(question, universe, now, overrides);
  if (!plan.assets.length) {
    const names = plan.unknownAssets.join(", ");
    throw new ResearchInputError(`${names} ${plan.unknownAssets.length > 1 ? "are" : "is"} not traded on the live market data Meridian reads, which covers ${universe.size} crypto perpetual markets. Try a question about BTC, ETH, SOL or JTO.`);
  }
  await data.step(
    "Read the question",
    async () => plan,
    (p) => `${p.assets.join(", ")} over ${p.days} days; ${p.analyses.map((a) => ANALYSIS_LABELS[a].toLowerCase()).join(", ")}`,
  );

  const snapshot = await data.step("Read current prices", () => feed.snapshot(plan.assets));
  const ctx: AnalysisContext = { plan, data, now, seed, snapshot };

  // Run in turn so requests stay well inside the data provider's rate limit.
  const drafts: Draft[] = [];
  const skipped: Finding[] = [];
  for (const kind of plan.analyses) {
    try {
      drafts.push(await data.step(`Ran ${ANALYSIS_LABELS[kind].toLowerCase()} analysis`, () => ANALYSES[kind](ctx)));
    } catch (err) {
      const reason = err instanceof Skip ? err.message : "The data for this part of the report could not be fetched just now.";
      skipped.push({ kind, title: ANALYSIS_LABELS[kind], verdict: "skipped", headline: reason, stats: [], charts: [], cautions: [], method: "", testIds: [] });
    }
  }
  if (!drafts.length) throw new ResearchInputError(skipped[0]?.headline ?? "No analysis could be completed.");

  const { findings: done, tests, demoted } = finalize(drafts);
  // Keep the order the question raised topics in.
  const findings = plan.analyses.flatMap((k) => [...done, ...skipped].filter((f) => f.kind === k));
  const answered = findings.filter((f) => f.verdict !== "skipped");
  const points = answered.slice(1).map((f) => f.headline);
  if (demoted > 0) {
    points.push(`${demoted} ${demoted === 1 ? "result looked significant" : "results looked significant"} on ${demoted === 1 ? "its" : "their"} own but did not survive correcting for the ${tests.length} tests run here, so ${demoted === 1 ? "it is" : "they are"} treated as unproven.`);
  }

  return {
    id: fnv1a64(`${question}|${now}`),
    question,
    createdAt: now,
    plan,
    answer: { headline: answered[0].headline, points, verdict: answered[0].verdict },
    snapshot,
    findings,
    tests,
    demoted,
    sources: [...data.sources.values()],
    trace: data.trace,
    fingerprint: data.fingerprint(),
    engineVersion: ENGINE_VERSION,
    seed,
  };
}
