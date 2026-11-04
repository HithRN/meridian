import { describe, expect, it } from "vitest";
import { Rng } from "@/core/ml/rng";
import { INTERVAL_MS, type Interval } from "@/core/market/book";
import { finalize, oddsOfChance, walkForwardSignal, type Draft } from "@/core/market/research/analyses";
import { cleanBars, type Bar, type MarketFeedSource } from "@/core/market/research/data";
import { epochStartFromAnchors } from "@/core/solana/epochs";
import { buildPlan, intervalForDays, parseAssets } from "@/core/market/research/plan";
import { ResearchInputError, runMarketResearch } from "@/core/market/research/run";
import {
  benjaminiHochberg,
  blockBootstrapCI,
  chiSquareP,
  excessKurtosis,
  hacMeanTest,
  hacRegression,
  histogram,
  kruskalWallis,
  ljungBox,
  percentileRank,
  rangeCoverage,
  ranks,
  simulateRange,
  spearman,
  tTestP,
  underwater,
  zTestP,
} from "@/core/market/research/stats";
import { ANALYSIS_KINDS } from "@/core/market/research/types";

const NOW = Date.UTC(2026, 10, 4, 12, 30);
const UNIVERSE = new Set(["BTC", "ETH", "SOL", "JTO", "HYPE", "kBONK", "ME", "AI", "XRP"]);

const noise = (n: number, seed = 1, sd = 0.01) => {
  const rng = new Rng(seed);
  return Array.from({ length: n }, () => rng.normal(0, sd));
};

describe("distributions", () => {
  it("matches known critical values", () => {
    expect(tTestP(2.228, 10)).toBeCloseTo(0.05, 3);
    expect(tTestP(1.96, 1e6)).toBeCloseTo(0.05, 3);
    expect(zTestP(2.576)).toBeCloseTo(0.01, 3);
    expect(chiSquareP(3.841, 1)).toBeCloseTo(0.05, 3);
    expect(chiSquareP(36.415, 24)).toBeCloseTo(0.05, 3);
    expect(chiSquareP(5.991, 2)).toBeCloseTo(0.05, 3);
  });
});

describe("robust tests", () => {
  it("finds no drift in pure noise and finds a clear drift", () => {
    expect(hacMeanTest(noise(2000)).p).toBeGreaterThan(0.05);
    expect(hacMeanTest(noise(2000).map((r) => r + 0.002)).p).toBeLessThan(0.001);
  });

  it("widens the standard error when returns are autocorrelated", () => {
    const e = noise(3000, 2);
    const ar = [e[0]];
    for (let i = 1; i < e.length; i++) ar.push(0.7 * ar[i - 1] + e[i]);
    const naive = hacMeanTest(ar, 0, 0).se;
    const robust = hacMeanTest(ar).se;
    expect(robust).toBeGreaterThan(naive * 1.8);
  });

  it("recovers a regression slope", () => {
    const x = noise(1500, 3);
    const e = noise(1500, 4, 0.002);
    const r = hacRegression(x, x.map((v, i) => 1.5 * v + e[i]));
    expect(r.beta).toBeCloseTo(1.5, 1);
    expect(r.p).toBeLessThan(0.001);
    expect(r.r2).toBeGreaterThan(0.9);
  });

  it("adjusts p-values with Benjamini-Hochberg", () => {
    const adj = benjaminiHochberg([0.01, 0.04, 0.03, 0.005]);
    expect(adj[3]).toBeCloseTo(0.02, 9);
    expect(adj[0]).toBeCloseTo(0.02, 9);
    expect(adj[2]).toBeCloseTo(0.04, 9);
    expect(adj[1]).toBeCloseTo(0.04, 9);
  });

  it("gives a bootstrap interval around the true mean, reproducibly", () => {
    const xs = noise(1000, 5).map((r) => r + 0.001);
    const stat = (s: readonly number[]) => s.reduce((a, b) => a + b, 0) / s.length;
    const ci = blockBootstrapCI(xs, stat, { resamples: 400 });
    expect(ci.lo).toBeLessThan(0.0015);
    expect(ci.hi).toBeGreaterThan(0.0005);
    expect(blockBootstrapCI(xs, stat, { resamples: 400 })).toEqual(ci);
  });
});

describe("descriptive statistics", () => {
  it("shares ranks between ties", () => {
    expect(ranks([10, 20, 20, 30])).toEqual([1, 2.5, 2.5, 4]);
  });

  it("measures monotonic links without assuming a straight line", () => {
    const x = noise(200, 6).map((v) => v * 100);
    expect(spearman(x, x.map((v) => v ** 3)).rho).toBeCloseTo(1, 6);
    expect(spearman(noise(400, 7), noise(400, 8)).p).toBeGreaterThan(0.01);
  });

  it("detects a difference between groups", () => {
    const a = noise(300, 9);
    expect(kruskalWallis([a, a.map((v) => v + 0.05)]).p).toBeLessThan(0.001);
    expect(kruskalWallis([noise(300, 10), noise(300, 11)]).p).toBeGreaterThan(0.01);
  });

  it("sees structure only where it exists", () => {
    const e = noise(2000, 12);
    const ar = [e[0]];
    for (let i = 1; i < e.length; i++) ar.push(0.4 * ar[i - 1] + e[i]);
    expect(ljungBox(ar, 10).p).toBeLessThan(0.001);
    expect(ljungBox(e, 10).p).toBeGreaterThan(0.01);
  });

  it("reads underwater distance and percentile rank", () => {
    expect(underwater([100, 110, 99, 121])).toEqual([0, 0, expect.closeTo(-0.1, 9), 0]);
    expect(percentileRank([1, 2, 3, 4], 2)).toBe(0.5);
  });

  it("recognises fat tails", () => {
    const rng = new Rng(13);
    const fat = Array.from({ length: 4000 }, () => rng.normal(0, rng.next() < 0.05 ? 0.1 : 0.01));
    expect(excessKurtosis(fat)).toBeGreaterThan(3);
    const bins = histogram(fat);
    expect(bins.reduce((s, b) => s + b.count, 0)).toBe(4000);
  });
});

describe("range simulation", () => {
  it("is centred, widens with time and is reproducible", () => {
    const r = noise(600, 14, 0.03);
    const sims = simulateRange(r, 30, { paths: 800 });
    const spread = (xs: number[]) => {
      const s = [...xs].sort((a, b) => a - b);
      return s[Math.floor(s.length * 0.95)] - s[Math.floor(s.length * 0.05)];
    };
    expect(spread(sims[30])).toBeGreaterThan(spread(sims[5]) * 1.8);
    expect(Math.abs(sims[30].reduce((a, b) => a + b, 0) / 800)).toBeLessThan(0.03);
    expect(simulateRange(r, 30, { paths: 800 })).toEqual(sims);
  });

  it("achieves close to its stated coverage on well-behaved data", () => {
    const c = rangeCoverage(noise(900, 15, 0.03), 10, { step: 10, paths: 150 });
    expect(c.rate).toBeGreaterThan(0.8);
    expect(c.rate).toBeLessThanOrEqual(1);
  });
});

describe("signal test", () => {
  const opts = { mode: "momentum" as const, lookbacks: [6, 12, 24], costPerSide: 0 };

  it("cannot see the future: it earns nothing from an unpredictable series", () => {
    const r = walkForwardSignal(noise(3000, 16), [], opts);
    expect(Math.abs(hacMeanTest(r.net).t)).toBeLessThan(2.6);
  });

  it("finds real persistence and loses it when reversed", () => {
    const e = noise(3000, 17);
    const ar = [e[0]];
    for (let i = 1; i < e.length; i++) ar.push(0.2 * ar[i - 1] + e[i]);
    const momentum = walkForwardSignal(ar, [], { ...opts, lookbacks: [1, 2] });
    const reversal = walkForwardSignal(ar, [], { ...opts, lookbacks: [1, 2], mode: "reversion" });
    expect(hacMeanTest(momentum.net).p).toBeLessThan(0.01);
    expect(momentum.net.reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
    expect(reversal.net.reduce((a, b) => a + b, 0)).toBeLessThan(0);
  });

  it("charges costs on every change of position", () => {
    const r = noise(1000, 18);
    const free = walkForwardSignal(r, [], { ...opts, lookbacks: [6] });
    const paid = walkForwardSignal(r, [], { ...opts, lookbacks: [6], costPerSide: 0.001 });
    const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
    expect(sum(free.net) - sum(paid.net)).toBeCloseTo(free.trades * 0.001, 6);
    expect(paid.gross).toEqual(free.gross);
  });

  it("makes a long position pay funding", () => {
    const up = new Array(500).fill(0.001);
    const funding = new Array(500).fill(0.0001);
    const r = walkForwardSignal(up, funding, { ...opts, lookbacks: [5] });
    expect(r.net[r.net.length - 1]).toBeCloseTo(0.0009, 9);
  });
});

describe("question reader", () => {
  it("recognises names, tickers and cashtags in order", () => {
    expect(parseAssets("Is solana stronger than BTC or $HYPE?", UNIVERSE).assets).toEqual(["SOL", "BTC", "HYPE"]);
    expect(parseAssets("is sol moving with bitcoin", UNIVERSE).assets).toEqual(["SOL", "BTC"]);
    expect(parseAssets("will bonk rally", UNIVERSE).assets).toEqual(["kBONK"]);
  });

  it("does not mistake ordinary words for tickers", () => {
    expect(parseAssets("Tell ME what AI thinks about MEV on SOL", UNIVERSE).assets).toEqual(["SOL"]);
    expect(parseAssets("Tell me about all of this", UNIVERSE).assets).toEqual([]);
  });

  it("reports tickers it cannot find", () => {
    expect(parseAssets("How is AAPL doing?", UNIVERSE).unknown).toEqual(["AAPL"]);
  });

  it("reads time windows", () => {
    const days = (q: string) => buildPlan(q, UNIVERSE, NOW).days;
    expect(days("SOL trend over the last 30 days")).toBe(30);
    expect(days("SOL trend in the past 2 weeks")).toBe(14);
    expect(days("SOL trend past 6 months")).toBe(180);
    expect(days("SOL this week")).toBe(7);
    expect(days("SOL today")).toBe(1);
    expect(days("SOL this year")).toBe(Math.ceil((NOW - Date.UTC(2026, 0, 1)) / 86_400_000));
    expect(days("SOL trend")).toBe(90);
  });

  it("keeps other numbers out of the time window", () => {
    const p = buildPlan("Does 24-hour momentum work on SOL?", UNIVERSE, NOW);
    expect(p.signal).toEqual({ mode: "momentum", lookbackHours: 24 });
    expect(p.days).toBe(90);
    const r = buildPlan("Where could SOL be in the next 14 days?", UNIVERSE, NOW);
    expect(r.horizonDays).toBe(14);
    expect(r.days).toBe(90);
    expect(r.analyses[0]).toBe("range");
    const o = buildPlan("How much would a $1M SOL order cost to execute?", UNIVERSE, NOW);
    expect(o.orderUsd).toBe(1_000_000);
    expect(o.days).toBe(90);
    expect(o.analyses).toContain("liquidity");
    expect(buildPlan("cost of a $250k JTO order", UNIVERSE, NOW).orderUsd).toBe(250_000);
  });

  it("maps what is being asked to the right analyses, in order", () => {
    const kinds = (q: string) => buildPlan(q, UNIVERSE, NOW).analyses;
    expect(kinds("Is funding on HYPE crowded?")[0]).toBe("funding");
    expect(kinds("Is SOL still correlated with BTC?")).toEqual(["correlation"]);
    expect(kinds("Which hours are most volatile for BTC?")).toEqual(["seasonality"]);
    expect(kinds("Is funding on HYPE crowded, and does it predict returns?")).toEqual(["funding"]);
    expect(kinds("Is SOL moving with BTC, and does it fall harder when BTC falls?")).toEqual(["correlation"]);
    expect(kinds("What are SOL returns like?")).toEqual(["trend", "drawdown"]);
    expect(kinds("Does Solana MEV rise when SOL gets more volatile?")[0]).toBe("mev");
    expect(kinds("Test mean reversion on SOL")[0]).toBe("signal");
    expect(kinds("How risky is JTO?")).toEqual(["volatility", "distribution"]);
  });

  it("states what it assumed", () => {
    const p = buildPlan("What is going on?", UNIVERSE, NOW);
    expect(p.assets).toEqual(["SOL"]);
    expect(p.analyses.length).toBeGreaterThan(2);
    expect(p.notes.join(" ")).toMatch(/90 days/);
    expect(buildPlan("Where could SOL be next month?", UNIVERSE, NOW).notes).toEqual([]);
    expect(p.notes.join(" ")).toMatch(/SOL/);
  });

  it("declines to give advice but still shows evidence", () => {
    const p = buildPlan("Should I buy SOL now?", UNIVERSE, NOW);
    expect(p.notes.join(" ")).toMatch(/does not say what to buy/);
    expect(p.analyses).toContain("trend");
  });

  it("does not silently swap in another market for one it cannot find", () => {
    const p = buildPlan("Trend in AAPL", UNIVERSE, NOW);
    expect(p.assets).toEqual([]);
    expect(p.unknownAssets).toEqual(["AAPL"]);
  });

  it("applies the reader's corrections", () => {
    const p = buildPlan("SOL trend", UNIVERSE, NOW, { assets: ["BTC", "NOPE"], days: 14, analyses: ["funding"] });
    expect(p.assets).toEqual(["BTC"]);
    expect(p.days).toBe(14);
    expect(p.interval).toBe("1h");
    expect(p.analyses).toEqual(["funding"]);
  });

  it("uses a benchmark other than the asset itself", () => {
    expect(buildPlan("BTC correlation", UNIVERSE, NOW).benchmark).toBe("ETH");
    expect(buildPlan("SOL correlation", UNIVERSE, NOW).benchmark).toBe("BTC");
  });

  it("chooses a sensible candle size", () => {
    expect(intervalForDays(1)).toBe("5m");
    expect(intervalForDays(7)).toBe("15m");
    expect(intervalForDays(30)).toBe("1h");
    expect(intervalForDays(90)).toBe("4h");
    expect(intervalForDays(365)).toBe("1d");
  });
});

describe("data cleaning", () => {
  const STEP = INTERVAL_MS["1h"];
  const bar = (t: number, n = 5): Bar => ({ t, o: 1, h: 1, l: 1, c: 1, v: 1, n });

  it("drops the unfinished candle and backfilled history, and reports gaps", () => {
    const start = NOW - NOW % STEP - 6 * STEP;
    const raw = [bar(start, 0), bar(start + STEP), bar(start + 2 * STEP), bar(start + 4 * STEP), bar(start + 5 * STEP), bar(start + 6 * STEP)];
    const { bars, issues } = cleanBars(raw, "1h", NOW);
    expect(bars[0].t).toBe(start + STEP);
    expect(bars[bars.length - 1].t).toBe(start + 5 * STEP);
    expect(issues.join(" ")).toMatch(/1 earlier candles were backfilled/);
    expect(issues.join(" ")).toMatch(/1 candles are missing/);
  });

  it("dates epochs from measured anchors, not an assumed length", () => {
    const anchors = [[100, 0], [110, 10_000], [120, 30_000]] as const;
    expect(epochStartFromAnchors(anchors, 105)).toBe(5_000);
    expect(epochStartFromAnchors(anchors, 115)).toBe(20_000);
    expect(epochStartFromAnchors(anchors, 125)).toBe(40_000);
    expect(epochStartFromAnchors(anchors, 95)).toBe(-5_000);
  });
});

describe("multiple-testing correction", () => {
  const draft = (id: string, p: number): Draft => ({
    kind: "trend",
    title: id,
    stats: [],
    charts: [],
    cautions: [],
    method: "",
    tests: [{ id, question: id, effect: "", method: "", p }],
    compose: (result) => ({ headline: result(id)?.significant ? "real" : "unproven", verdict: "inconclusive" }),
  });

  it("writes findings from corrected results and counts what was demoted", () => {
    const many = Array.from({ length: 19 }, (_, i) => draft(`n${i}`, 0.5));
    const { findings, demoted } = finalize([draft("borderline", 0.04), ...many]);
    expect(findings[0].headline).toBe("unproven");
    expect(demoted).toBe(1);
    const strong = finalize([draft("strong", 0.0001), ...many]);
    expect(strong.findings[0].headline).toBe("real");
    expect(strong.demoted).toBe(0);
  });

  it("states chance in plain words", () => {
    expect(oddsOfChance(0.0001)).toBe("less than 1 in 1,000");
    expect(oddsOfChance(0.025)).toBe("about 1 in 40");
    expect(oddsOfChance(0.7)).toBe("better than even");
  });
});

/* A complete offline market, so every analysis can be run end to end. */
function fixtureFeed(): MarketFeedSource {
  const start = (interval: Interval) => NOW - NOW % INTERVAL_MS[interval];
  return {
    universe: async () => UNIVERSE,
    snapshot: async (coins) => coins.map((coin) => ({ coin, price: 100, change24h: 0.01, volumeUsd: 2e8, openInterestUsd: 1e8, fundingApr: 0.11 })),
    candles: async (coin, interval, count) => {
      const rng = new Rng(coin.length * 31 + count);
      const common = new Rng(99);
      let price = 100;
      const step = INTERVAL_MS[interval];
      const sd = 0.03 * Math.sqrt(step / 86_400_000);
      return Array.from({ length: count }, (_, i) => {
        const m = common.normal(0, sd);
        price *= Math.exp(0.7 * m + rng.normal(0, sd * 0.7));
        return { t: start(interval) - (count - 1 - i) * step, o: price, h: price * 1.001, l: price * 0.999, c: price, v: 1000, n: 10 };
      });
    },
    funding: async (coin, startMs, now) => {
      const rng = new Rng(coin.length);
      const out = [];
      for (let t = startMs - (startMs % 3_600_000); t < now; t += 3_600_000) out.push({ t, rate: 0.0000125 + rng.normal(0, 0.000005) });
      return out;
    },
    book: async () => {
      const levels = (dir: number) => Array.from({ length: 60 }, (_, i) => ({ px: 100 + dir * (0.01 + i * 0.02), sz: 3000, n: 3 }));
      return { bids: levels(-1), asks: levels(1) };
    },
    epochs: async (count) => ({ data: Array.from({ length: count }, (_, i) => ({ epoch: 1000 + i, totalMevSol: 1000 + i * 10 })), source: "live" }),
    epochStarts: async (epochs) => ({ starts: new Map(epochs.map((e) => [e, NOW - 3_600_000 - (1041 - e) * 86_400_000])), source: "fixture" }),
  };
}

describe("end-to-end report", () => {
  const run = (question: string, overrides = {}) => runMarketResearch({ question, overrides, feed: fixtureFeed(), now: NOW });

  it("completes every analysis on a fixture market, with no invalid numbers", async () => {
    const report = await run("SOL and BTC overview", { analyses: [...ANALYSIS_KINDS], days: 30, assets: ["SOL", "ETH"] });
    const skipped = report.findings.filter((f) => f.verdict === "skipped");
    expect(skipped.map((f) => f.headline)).toEqual([]);
    expect(report.findings.map((f) => f.kind)).toEqual([...ANALYSIS_KINDS]);
    const text = JSON.stringify(report);
    expect(text).not.toMatch(/NaN%|Infinity|undefined/);
    expect(text).not.toContain("—");
    for (const f of report.findings) {
      expect(f.headline.length).toBeGreaterThan(20);
      expect(f.charts.length).toBeGreaterThan(0);
    }
    expect(report.tests.every((t) => t.pAdjusted >= t.p - 1e-12 && t.pAdjusted <= 1 + 1e-12)).toBe(true);
    expect(report.trace.length).toBeGreaterThan(5);
    expect(report.sources.length).toBeGreaterThan(3);
  }, 60_000);

  it("gives identical results on identical data", async () => {
    const a = await run("Is SOL trending?");
    const b = await run("Is SOL trending?");
    expect(a.fingerprint).toBe(b.fingerprint);
    expect(a.findings).toEqual(b.findings);
    expect(a.tests).toEqual(b.tests);
  });

  it("explains a market it cannot find instead of guessing", async () => {
    await expect(run("Trend in AAPL")).rejects.toBeInstanceOf(ResearchInputError);
    await expect(run("Trend in AAPL")).rejects.toThrow(/AAPL is not traded/);
  });

  it("reports a failed section without losing the rest", async () => {
    const feed = fixtureFeed();
    feed.funding = async () => {
      throw new Error("network");
    };
    const report = await runMarketResearch({ question: "SOL funding and trend", feed, now: NOW });
    expect(report.findings.find((f) => f.kind === "funding")?.verdict).toBe("skipped");
    expect(report.findings.find((f) => f.kind === "trend")?.verdict).not.toBe("skipped");
  });
});
