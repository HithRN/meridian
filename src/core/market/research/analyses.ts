/**
 * The research modules. Each one reads live data, computes every figure in code
 * and returns a draft finding. Its headline is written only after all the tests
 * in the report have been corrected for multiple testing.
 */

import { bookStats, executionCost, formatCompact, formatPrice, INTERVAL_MS, mergeDepth, type Interval, type Level } from "@/core/market/book";
import { correlation, mean, quantile, std } from "@/core/ml/stats";
import { contextBars, type Bar, type ResearchData } from "@/core/market/research/data";
import {
  autocorrelations,
  benjaminiHochberg,
  blockBootstrapCI,
  correlationDiffTest,
  excessKurtosis,
  fisherCI,
  hacDiffTest,
  hacMeanTest,
  hacRegression,
  autoLag,
  histogram,
  jarqueBera,
  kruskalWallis,
  ljungBox,
  logReturns,
  percentileRank,
  rangeCoverage,
  rollingCorrelation,
  rollingStd,
  simulateRange,
  skewness,
  spearman,
  underwater,
  zTestP,
} from "@/core/market/research/stats";
import type { AnalysisKind, ChartSpec, EvidenceTest, Finding, KeyStat, MarketSnapshot, ResearchPlan, Verdict } from "@/core/market/research/types";

const DAY = 86_400_000;
const HOUR = 3_600_000;
const TAKER_FEE_BPS = 4.5;
/** Hyperliquid's funding when the premium is zero: 0.00125% an hour. */
const BASE_FUNDING_HOURLY = 0.0000125;
const CHART_POINTS = 320;
const MIN_BARS = 20;

export interface AnalysisContext {
  plan: ResearchPlan;
  data: ResearchData;
  now: number;
  seed: number;
  snapshot: MarketSnapshot[];
}

export interface RawTest {
  id: string;
  question: string;
  effect: string;
  method: string;
  p: number;
}

type Compose = (result: (id: string) => EvidenceTest | undefined) => { headline: string; verdict: Verdict };

export interface Draft {
  kind: AnalysisKind;
  title: string;
  stats: KeyStat[];
  table?: { columns: string[]; rows: string[][] };
  charts: ChartSpec[];
  cautions: string[];
  method: string;
  tests: RawTest[];
  compose: Compose;
}

/** Raised when an analysis cannot honestly run; the report says why instead. */
export class Skip extends Error {}

/* ------------------------------------------------------------------- helpers */

const num = (v: number, d = 2) => (Number.isFinite(v) ? v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }) : "n/a");
export const pct = (v: number, d = 1) => (Number.isFinite(v) ? `${(v * 100).toFixed(d)}%` : "n/a");
export const signedPct = (v: number, d = 1) => (Number.isFinite(v) ? `${v >= 0 ? "+" : "-"}${Math.abs(v * 100).toFixed(d)}%` : "n/a");
/** "$1M", "$250k", "$29.5M": no padding zeros on round figures. */
const usd = (v: number) => (Number.isFinite(v) ? `$${formatCompact(v).replace(/\.0+([kMB]?)$/, "$1").replace(/(\.\d*[1-9])0+([kMB])$/, "$1$2")}` : "n/a");
const round = (v: number, d = 4) => (Number.isFinite(v) ? Number(v.toFixed(d)) : null);
const windowLabel = (days: number) => (days < 1 ? `${Math.round(days * 24)} hours` : days === 1 ? "24 hours" : `${Math.round(days)} days`);

/** "about 1 in 40", the plain reading of a p-value. */
export function oddsOfChance(p: number): string {
  if (p < 0.001) return "less than 1 in 1,000";
  if (p >= 0.5) return "better than even";
  const odds = 1 / p;
  return `about 1 in ${odds >= 100 ? Math.round(odds / 10) * 10 : odds >= 10 ? Math.round(odds) : odds.toFixed(0)}`;
}

function thin<T>(rows: readonly T[], max = CHART_POINTS): T[] {
  if (rows.length <= max) return [...rows];
  const step = (rows.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => rows[Math.round(i * step)]);
}

const candleName = (interval: Interval) => ({ "1m": "1-minute", "5m": "5-minute", "15m": "15-minute", "1h": "hourly", "4h": "4-hour", "1d": "daily" })[interval];
const barsPerYear = (interval: Interval) => (365 * DAY) / INTERVAL_MS[interval];
const significant = (r: EvidenceTest | undefined) => Boolean(r?.significant);

async function loadBars(ctx: AnalysisContext, coin: string, interval = ctx.plan.interval, days = ctx.plan.days) {
  const all = await ctx.data.candles(coin, interval, contextBars(days, interval));
  const start = ctx.now - days * DAY;
  const window = all.filter((b) => b.t >= start);
  if (window.length < MIN_BARS) throw new Skip(`${coin} has only ${window.length} ${candleName(interval)} candles in this window, too few to test.`);
  return { all, window };
}

const closes = (bars: readonly Bar[]) => bars.map((b) => b.c);

function alignReturns(a: readonly Bar[], b: readonly Bar[]): { t: number[]; a: number[]; b: number[] } {
  const prices = new Map(b.map((x) => [x.t, x.c]));
  const t: number[] = [];
  const ra: number[] = [];
  const rb: number[] = [];
  for (let i = 1; i < a.length; i++) {
    const p1 = prices.get(a[i].t);
    const p0 = prices.get(a[i - 1].t);
    if (p0 && p1) {
      t.push(a[i].t);
      ra.push(Math.log(a[i].c / a[i - 1].c));
      rb.push(Math.log(p1 / p0));
    }
  }
  return { t, a: ra, b: rb };
}

const HAC = "Newey-West t-test, which allows for returns being related over time";

/* --------------------------------------------------------------------- trend */

export async function trend(ctx: AnalysisContext): Promise<Draft> {
  const { plan } = ctx;
  const loaded = await Promise.all(plan.assets.map(async (coin) => ({ coin, ...(await loadBars(ctx, coin)) })));
  const rows = loaded.map(({ coin, window }, i) => {
    const prices = closes(window);
    const rets = logReturns(prices);
    const test = hacMeanTest(rets);
    const total = Math.exp(rets.reduce((s, r) => s + r, 0)) - 1;
    const ci = blockBootstrapCI(rets, (x) => Math.exp(x.reduce((s, r) => s + r, 0)) - 1, { seed: ctx.seed + i });
    const best3 = [...rets].sort((a, b) => b - a).slice(0, 3).filter((r) => r > 0).reduce((s, r) => s + r, 0);
    const worst3 = [...rets].sort((a, b) => a - b).slice(0, 3).filter((r) => r < 0).reduce((s, r) => s + r, 0);
    const halfway = Math.floor(rets.length / 2);
    const first = Math.exp(rets.slice(0, halfway).reduce((s, r) => s + r, 0)) - 1;
    const second = Math.exp(rets.slice(halfway).reduce((s, r) => s + r, 0)) - 1;
    return {
      coin,
      window,
      prices,
      rets,
      test,
      total,
      ci,
      withoutBest3: Math.exp(rets.reduce((s, r) => s + r, 0) - best3) - 1,
      withoutWorst3: Math.exp(rets.reduce((s, r) => s + r, 0) - worst3) - 1,
      first,
      second,
      upShare: rets.filter((r) => r > 0).length / Math.max(1, rets.length),
      /** Smallest total move this much noise lets us tell apart from zero. */
      detectable: Math.exp(1.96 * test.se * rets.length) - 1,
    };
  });

  const lead = rows[0];
  const tests: RawTest[] = rows.map((r) => ({
    id: `trend:${r.coin}`,
    question: `Is the move in ${r.coin} more than noise?`,
    effect: `${signedPct(r.total)} over ${windowLabel(plan.days)}`,
    method: HAC,
    p: r.test.p,
  }));

  const relative = rows.slice(1).map((r) => {
    const aligned = alignReturns(lead.window, r.window);
    const diff = aligned.a.map((x, i) => x - aligned.b[i]);
    const test = hacMeanTest(diff);
    return { coin: r.coin, gap: Math.exp(diff.reduce((s, x) => s + x, 0)) - 1, test };
  });
  for (const r of relative) {
    tests.push({
      id: `relative:${r.coin}`,
      question: `Did ${lead.coin} really do better or worse than ${r.coin}?`,
      effect: `${signedPct(r.gap)} relative`,
      method: HAC,
      p: r.test.p,
    });
  }

  let chart: ChartSpec;
  if (rows.length === 1) {
    const x = lead.prices.map((_, i) => i);
    const fit = hacRegression(x, lead.prices.map(Math.log));
    chart = {
      type: "line",
      title: `${lead.coin} price with its average path`,
      caption: "The solid line is the price. The dashed line is the steady path that best fits it. The further the price wanders from that path, the less a single direction describes what happened.",
      x: "time",
      format: "price",
      series: [
        { key: "price", label: `${lead.coin} price`, color: 0 },
        { key: "fit", label: "Average path", color: "benchmark", dashed: true },
      ],
      points: thin(lead.window.map((b, i) => ({ t: b.t, price: b.c, fit: round(Math.exp(fit.alpha + fit.beta * i), 6) }))),
    };
  } else {
    const start = new Map(rows.map((r) => [r.coin, r.prices[0]]));
    const byTime = new Map<number, Record<string, number | null>>();
    for (const r of rows) for (const b of r.window) byTime.set(b.t, { ...(byTime.get(b.t) ?? { t: b.t }), [r.coin]: round((b.c / start.get(r.coin)!) * 100, 2) });
    chart = {
      type: "line",
      title: "Performance, all starting at 100",
      caption: "Every market starts at 100 so they can be compared directly. A line at 110 is up 10% since the start.",
      x: "time",
      format: "index",
      series: rows.map((r, i) => ({ key: r.coin, label: r.coin, color: i })),
      points: thin([...byTime.values()].sort((a, b) => Number(a.t) - Number(b.t))),
      guides: [{ value: 100, label: "Start" }],
    };
  }

  const cautions: string[] = [];
  for (const r of rows) {
    if (Math.abs(r.withoutBest3) < Math.abs(r.total) / 2 && r.total > 0) cautions.push(`${r.coin}: three candles did much of the work. Without its three best, the return is ${signedPct(r.withoutBest3)} instead of ${signedPct(r.total)}.`);
    if (Math.abs(r.withoutWorst3) < Math.abs(r.total) / 2 && r.total < 0) cautions.push(`${r.coin}: three candles did much of the damage. Without its three worst, the return is ${signedPct(r.withoutWorst3)} instead of ${signedPct(r.total)}.`);
    if (Math.sign(r.first) !== Math.sign(r.second)) cautions.push(`${r.coin} changed direction: ${signedPct(r.first)} in the first half of the window, then ${signedPct(r.second)} in the second.`);
  }

  return {
    kind: "trend",
    title: rows.length > 1 ? "Performance and trend" : `Is ${lead.coin} really trending?`,
    stats:
      rows.length === 1
        ? [
            { label: "Return", value: signedPct(lead.total), hint: `Over ${windowLabel(plan.days)}` },
            { label: "Likely range of the true move", value: `${signedPct(lead.ci.lo, 0)} to ${signedPct(lead.ci.hi, 0)}`, hint: "95% interval" },
            { label: "Noise level", value: `±${pct(lead.detectable, 0)}`, hint: "Smaller moves cannot be told apart from noise" },
            { label: "Rising candles", value: pct(lead.upShare, 0), hint: `Of ${lead.rets.length.toLocaleString("en-US")} ${candleName(plan.interval)} candles` },
          ]
        : [],
    table:
      rows.length > 1
        ? {
            columns: ["Market", "Return", "95% range", "Noise level", "Rising candles"],
            rows: rows.map((r) => [r.coin, signedPct(r.total), `${signedPct(r.ci.lo, 0)} to ${signedPct(r.ci.hi, 0)}`, `±${pct(r.detectable, 0)}`, pct(r.upShare, 0)]),
          }
        : undefined,
    charts: [chart],
    cautions,
    method: `Tests whether the average ${candleName(plan.interval)} return differs from zero, using a test that allows for returns being related over time. The range comes from reshuffling blocks of real returns 1,000 times. A straight-line fit through price is drawn for reading only, because prices drift and that fit overstates significance.`,
    tests,
    compose: (result) => {
      const r = result(`trend:${lead.coin}`);
      const moved = `${lead.coin} is ${lead.total >= 0 ? "up" : "down"} ${pct(Math.abs(lead.total))} over ${windowLabel(plan.days)}`;
      let headline: string;
      if (significant(r)) {
        headline = `${moved}, and that is a real ${lead.total >= 0 ? "uptrend" : "downtrend"} on this evidence: a move this large would come from noise ${oddsOfChance(r!.p)}.`;
      } else {
        headline = `${moved}, but that is within normal noise for how much it swings (moves under about ±${pct(lead.detectable, 0)} cannot be told apart from chance), so the data does not establish a real trend.`;
      }
      const rel = relative.find((x) => significant(result(`relative:${x.coin}`)));
      if (rel) headline += ` It has clearly ${rel.gap >= 0 ? "beaten" : "lagged"} ${rel.coin}, by ${pct(Math.abs(rel.gap))}.`;
      else if (relative.length) headline += ` The gap against ${relative.map((x) => x.coin).join(" and ")} is not distinguishable from chance.`;
      return { headline, verdict: significant(r) ? "clear" : "inconclusive" };
    },
  };
}

/* ---------------------------------------------------------------- volatility */

export async function volatility(ctx: AnalysisContext): Promise<Draft> {
  const { plan } = ctx;
  const year = barsPerYear(plan.interval);
  const loaded = await Promise.all(plan.assets.map(async (coin) => ({ coin, ...(await loadBars(ctx, coin)) })));
  const rows = loaded.map(({ coin, all, window }) => {
    const rets = logReturns(closes(all));
    const w = Math.max(12, Math.min(Math.round(window.length / 4), Math.round(year / 12)));
    const roll = rollingStd(rets, w).map((v) => (v === null ? null : v * Math.sqrt(year)));
    const values = roll.filter((v): v is number => v !== null);
    const sorted = [...values].sort((a, b) => a - b);
    const current = values[values.length - 1] ?? NaN;
    const recent = logReturns(closes(window)).map(Math.abs);
    const prior = rets.slice(Math.max(0, rets.length - 2 * recent.length), Math.max(0, rets.length - recent.length)).map(Math.abs);
    return {
      coin,
      t: all.slice(1).map((b) => b.t),
      roll,
      w,
      current,
      median: quantile(sorted, 0.5),
      percentile: percentileRank(sorted, current),
      typicalDay: current / Math.sqrt(365),
      change: prior.length >= MIN_BARS ? hacDiffTest(recent, prior) : null,
      ratio: prior.length >= MIN_BARS ? mean(recent) / mean(prior) : NaN,
      clustering: autocorrelations(rets.map((r) => r * r), 1)[0],
      historyDays: (all.length * INTERVAL_MS[plan.interval]) / DAY,
    };
  });
  const lead = rows[0];

  const tests: RawTest[] = rows.flatMap((r) =>
    r.change
      ? [
          {
            id: `vol:${r.coin}`,
            question: `Is ${r.coin} moving more or less than in the previous ${windowLabel(plan.days)}?`,
            effect: `Average move ${r.ratio >= 1 ? "up" : "down"} ${pct(Math.abs(r.ratio - 1), 0)}`,
            method: "Difference in average absolute returns, Newey-West",
            p: r.change.p,
          },
        ]
      : [],
  );

  const byTime = new Map<number, Record<string, number | null>>();
  for (const r of rows) r.t.forEach((t, i) => r.roll[i] !== null && byTime.set(t, { ...(byTime.get(t) ?? { t }), [r.coin]: round(r.roll[i]!, 4) }));

  return {
    kind: "volatility",
    title: rows.length > 1 ? "How rough is each market?" : `How rough is ${lead.coin} right now?`,
    stats:
      rows.length === 1
        ? [
            { label: "Typical daily move", value: `±${pct(lead.typicalDay)}`, hint: "One standard deviation" },
            { label: "Annualised volatility", value: pct(lead.current, 0), hint: `Normal for this market: ${pct(lead.median, 0)}` },
            { label: "Rougher than", value: pct(lead.percentile, 0), hint: `Of the last ${Math.round(lead.historyDays)} days` },
            { label: "Compared with the prior window", value: Number.isFinite(lead.ratio) ? signedPct(lead.ratio - 1, 0) : "n/a", hint: "Size of the average move" },
          ]
        : [],
    table:
      rows.length > 1
        ? {
            columns: ["Market", "Typical daily move", "Annualised", "Rougher than", "Against prior window"],
            rows: rows.map((r) => [r.coin, `±${pct(r.typicalDay)}`, pct(r.current, 0), `${pct(r.percentile, 0)} of history`, Number.isFinite(r.ratio) ? signedPct(r.ratio - 1, 0) : "n/a"]),
          }
        : undefined,
    charts: [
      {
        type: "line",
        title: "Volatility over time, annualised",
        caption: `Higher means bigger price swings, measured over a rolling ${windowLabel((lead.w * INTERVAL_MS[plan.interval]) / DAY)}. ${rows.length === 1 ? "The dashed line is this market's normal level." : ""}`.trim(),
        x: "time",
        format: "percent0",
        series: rows.map((r, i) => ({ key: r.coin, label: r.coin, color: i })),
        points: thin([...byTime.values()].sort((a, b) => Number(a.t) - Number(b.t))),
        guides: rows.length === 1 ? [{ value: round(lead.median, 4)!, label: "Normal" }] : undefined,
      },
    ],
    cautions: lead.clustering > 0.1 ? ["Rough periods in this market tend to follow rough periods, so today's level says more about next week than about next year."] : [],
    method: `Rolling standard deviation of ${candleName(plan.interval)} returns, annualised over 365 days because crypto trades every day. "Rougher than" ranks the latest value against this market's own history in the data fetched.`,
    tests,
    compose: (result) => {
      const r = result(`vol:${lead.coin}`);
      const level = lead.percentile >= 0.8 ? "unusually rough" : lead.percentile <= 0.2 ? "unusually calm" : "in its normal range";
      let headline = `${lead.coin} is ${level}: a typical day moves about ±${pct(lead.typicalDay)}, rougher than ${pct(lead.percentile, 0)} of the last ${Math.round(lead.historyDays)} days.`;
      if (r) headline += significant(r) ? ` Moves are clearly ${lead.ratio >= 1 ? "larger" : "smaller"} than in the previous window.` : " The change from the previous window is not distinguishable from chance.";
      return { headline, verdict: r ? (significant(r) ? "clear" : "inconclusive") : "measured" };
    },
  };
}

/* -------------------------------------------------------------- distribution */

export async function distribution(ctx: AnalysisContext): Promise<Draft> {
  const { plan } = ctx;
  const loaded = await Promise.all(plan.assets.map(async (coin) => ({ coin, ...(await loadBars(ctx, coin)) })));
  const rows = loaded.map(({ coin, all, window }) => {
    const source = window.length >= 200 ? window : all;
    const rets = logReturns(closes(source)).map((r) => Math.exp(r) - 1);
    const sorted = [...rets].sort((a, b) => a - b);
    const var95 = quantile(sorted, 0.05);
    const tail = sorted.filter((r) => r <= var95);
    const s = std(rets);
    const m = mean(rets);
    return {
      coin,
      rets,
      var95,
      es95: mean(tail),
      worst: sorted[0],
      best: sorted[sorted.length - 1],
      skew: skewness(rets),
      kurt: excessKurtosis(rets),
      jb: jarqueBera(rets),
      beyond3: rets.filter((r) => Math.abs(r - m) > 3 * s).length,
      expected3: rets.length * 0.0027,
      usedContext: source === all && window !== all,
    };
  });
  const lead = rows[0];
  const name = candleName(plan.interval);
  const bins = histogram(lead.rets).map((b) => ({ ...b, mid: round(b.mid * 100, 3)!, from: round(b.from * 100, 3)!, to: round(b.to * 100, 3)!, normal: round(b.normal, 2)! }));

  return {
    kind: "distribution",
    title: "How bad can a bad period get?",
    stats: [
      { label: `Bad ${name} candle`, value: signedPct(lead.var95, 2), hint: "1 in 20 candles was worse than this" },
      { label: "When it is bad, on average", value: signedPct(lead.es95, 2), hint: "Average of that worst 5%" },
      { label: "Worst candle", value: signedPct(lead.worst, 2), hint: `Best: ${signedPct(lead.best, 2)}` },
      { label: "Extreme moves", value: `${lead.beyond3} seen`, hint: `A bell curve predicts about ${lead.expected3.toFixed(0)}` },
    ],
    table:
      rows.length > 1
        ? {
            columns: ["Market", "1 in 20 worse than", "Average of worst 5%", "Worst candle", "Extreme moves (seen / expected)"],
            rows: rows.map((r) => [r.coin, signedPct(r.var95, 2), signedPct(r.es95, 2), signedPct(r.worst, 2), `${r.beyond3} / ${r.expected3.toFixed(0)}`]),
          }
        : undefined,
    charts: [
      {
        type: "histogram",
        title: `Size of ${lead.coin}'s ${name} moves`,
        caption: "Each bar counts how many candles moved by that much. The line is what a textbook bell curve predicts. Bars standing above the line at the far edges mean extreme moves happen more often than standard risk models assume.",
        bins,
      },
    ],
    cautions: lead.usedContext ? [`The window has too few candles to read the tails, so this uses all ${lead.rets.length.toLocaleString("en-US")} candles fetched.`] : [],
    method: `Historical (not modelled) value at risk and expected shortfall at 95%. Jarque-Bera tests whether skew (${num(lead.skew)}) and excess kurtosis (${num(lead.kurt)}) are consistent with a bell curve.`,
    tests: rows.map((r) => ({
      id: `tails:${r.coin}`,
      question: `Does ${r.coin} have fatter tails than a bell curve?`,
      effect: `Excess kurtosis ${num(r.kurt)}`,
      method: "Jarque-Bera",
      p: r.jb.p,
    })),
    compose: (result) => {
      const r = result(`tails:${lead.coin}`);
      const ratio = lead.expected3 > 0 ? lead.beyond3 / lead.expected3 : 0;
      return {
        headline: `One ${name} candle in twenty loses more than ${pct(Math.abs(lead.var95), 2)} on ${lead.coin}, and those bad candles average ${signedPct(lead.es95, 2)}.${
          significant(r) && ratio > 1.5 ? ` Extreme moves are ${ratio.toFixed(1)} times as common as a bell curve predicts, so standard risk models would understate the danger.` : ""
        }`,
        verdict: significant(r) ? "clear" : "inconclusive",
      };
    },
  };
}

/* ------------------------------------------------------------------ drawdown */

export async function drawdown(ctx: AnalysisContext): Promise<Draft> {
  const { plan } = ctx;
  const stepDays = INTERVAL_MS[plan.interval] / DAY;
  const loaded = await Promise.all(plan.assets.map(async (coin) => ({ coin, ...(await loadBars(ctx, coin)) })));
  const rows = loaded.map(({ coin, window }) => {
    const uw = underwater(closes(window));
    const max = Math.min(...uw);
    const current = uw[uw.length - 1];
    let longest = 0;
    let run = 0;
    for (const v of uw) {
      run = v < 0 ? run + 1 : 0;
      longest = Math.max(longest, run);
    }
    return { coin, window, uw, max, current, longestDays: longest * stepDays, currentDays: run * stepDays, toRecover: 1 / (1 + current) - 1 };
  });
  const lead = rows[0];
  const byTime = new Map<number, Record<string, number | null>>();
  for (const r of rows) r.window.forEach((b, i) => byTime.set(b.t, { ...(byTime.get(b.t) ?? { t: b.t }), [r.coin]: round(r.uw[i], 4) }));

  return {
    kind: "drawdown",
    title: "Falls from the peak",
    stats:
      rows.length === 1
        ? [
            { label: "Below its window high", value: pct(lead.current), hint: `Needs ${signedPct(lead.toRecover)} to get back` },
            { label: "Deepest fall", value: pct(lead.max), hint: `Within the last ${windowLabel(plan.days)}` },
            { label: "Longest time below a high", value: `${num(lead.longestDays, 1)} days` },
            { label: "Current stretch", value: `${num(lead.currentDays, 1)} days`, hint: "Since the last new high" },
          ]
        : [],
    table:
      rows.length > 1
        ? { columns: ["Market", "Now below high", "Deepest fall", "To recover", "Longest stretch"], rows: rows.map((r) => [r.coin, pct(r.current), pct(r.max), signedPct(r.toRecover), `${num(r.longestDays, 1)} days`]) }
        : undefined,
    charts: [
      {
        type: "line",
        area: rows.length === 1,
        title: "Distance below the highest point so far",
        caption: "Zero means a new high. The deeper the line, the further the price has fallen from its best level in this window.",
        x: "time",
        format: "percent",
        series: rows.map((r, i) => ({ key: r.coin, label: r.coin, color: i })),
        points: thin([...byTime.values()].sort((a, b) => Number(a.t) - Number(b.t))),
      },
    ],
    cautions: [],
    method: "Measured directly from closing prices within the window. Peaks before the window started are not counted, so the true fall from an all-time high can be larger.",
    tests: [],
    compose: () => ({
      headline: lead.current >= -0.0001 ? `${lead.coin} is at the high of this window; its deepest fall along the way was ${pct(Math.abs(lead.max))}.` : `${lead.coin} sits ${pct(Math.abs(lead.current))} below its high for this window and needs ${signedPct(lead.toRecover)} to get back; the deepest fall was ${pct(Math.abs(lead.max))}.`,
      verdict: "measured",
    }),
  };
}

/* --------------------------------------------------------------- correlation */

export async function correlationAnalysis(ctx: AnalysisContext): Promise<Draft> {
  const { plan } = ctx;
  const coins = plan.assets.filter((c) => c !== plan.benchmark);
  if (!coins.length) throw new Skip("Needs a second market to compare against.");
  const bench = await loadBars(ctx, plan.benchmark);
  const loaded = await Promise.all(coins.map(async (coin) => ({ coin, ...(await loadBars(ctx, coin)) })));

  const rows = loaded.map(({ coin, window }) => {
    const a = alignReturns(window, bench.window);
    if (a.a.length < MIN_BARS) throw new Skip(`${coin} and ${plan.benchmark} overlap on too few candles.`);
    const reg = hacRegression(a.b, a.a);
    const r = correlation(a.a, a.b);
    const ci = fisherCI(r, a.a.length);
    const betaVsOne = reg.se > 0 ? zTestP((reg.beta - 1) / reg.se) : 1;
    const downIdx = a.b.map((v, i) => (v < 0 ? i : -1)).filter((i) => i >= 0);
    const upIdx = a.b.map((v, i) => (v > 0 ? i : -1)).filter((i) => i >= 0);
    const pick = (xs: number[], idx: number[]) => idx.map((i) => xs[i]);
    const down = hacRegression(pick(a.b, downIdx), pick(a.a, downIdx));
    const up = hacRegression(pick(a.b, upIdx), pick(a.a, upIdx));
    const asymmetry = Math.hypot(down.se, up.se) > 0 ? zTestP((down.beta - up.beta) / Math.hypot(down.se, up.se)) : 1;
    const half = Math.floor(a.a.length / 2);
    const r1 = correlation(a.a.slice(0, half), a.b.slice(0, half));
    const r2 = correlation(a.a.slice(half), a.b.slice(half));
    const w = Math.max(12, Math.round(a.a.length / 5));
    return { coin, a, reg, r, ci, betaVsOne, down, up, asymmetry, r1, r2, half, shift: correlationDiffTest(r2, a.a.length - half, r1, half), roll: rollingCorrelation(a.a, a.b, w), w };
  });
  const lead = rows[0];

  const tests: RawTest[] = rows.flatMap((r) => [
    { id: `corr:${r.coin}`, question: `Does ${r.coin} move with ${plan.benchmark}?`, effect: `Correlation ${num(r.r)}`, method: "Regression slope, Newey-West", p: r.reg.p },
    { id: `beta:${r.coin}`, question: `Does ${r.coin} move more or less than 1:1 with ${plan.benchmark}?`, effect: `Beta ${num(r.reg.beta)}`, method: "Slope against 1, Newey-West", p: r.betaVsOne },
    { id: `asym:${r.coin}`, question: `Is ${r.coin} more sensitive when ${plan.benchmark} falls than when it rises?`, effect: `${num(r.down.beta)} on falls, ${num(r.up.beta)} on rises`, method: "Difference in up and down slopes", p: r.asymmetry },
    { id: `shift:${r.coin}`, question: `Has the link between ${r.coin} and ${plan.benchmark} changed during the window?`, effect: `${num(r.r1)} then ${num(r.r2)}`, method: "Fisher z-test on the two halves", p: r.shift.p },
  ]);

  const byTime = new Map<number, Record<string, number | null>>();
  for (const r of rows) r.a.t.forEach((t, i) => r.roll[i] !== null && byTime.set(t, { ...(byTime.get(t) ?? { t }), [r.coin]: round(r.roll[i]!, 3) }));
  const charts: ChartSpec[] = [
    {
      type: "line",
      title: `Correlation with ${plan.benchmark} over time`,
      caption: `1 means moving in lockstep with ${plan.benchmark}, 0 means no relationship. A line that holds steady is a link you can rely on; one that swings is not.`,
      x: "time",
      format: "corr",
      series: rows.map((r, i) => ({ key: r.coin, label: `${r.coin} vs ${plan.benchmark}`, color: i })),
      points: thin([...byTime.values()].sort((a, b) => Number(a.t) - Number(b.t))),
    },
  ];
  if (loaded.length >= 2) {
    const all = [{ coin: plan.benchmark, window: bench.window }, ...loaded];
    charts.push({
      type: "matrix",
      title: "How each pair moves together",
      caption: "Darker cells move more closely together. Pairs with pale cells are the ones that diversify each other.",
      labels: all.map((a) => a.coin),
      values: all.map((x) =>
        all.map((y) => {
          if (x.coin === y.coin) return 1;
          const a = alignReturns(x.window, y.window);
          return round(correlation(a.a, a.b), 2) ?? 0;
        }),
      ),
    });
  }

  const cautions: string[] = [];
  for (const r of rows) if (r.down.beta > r.up.beta * 1.25) cautions.push(`${r.coin} responds more to falls in ${plan.benchmark} (${num(r.down.beta)}) than to rises (${num(r.up.beta)}), so it offers least protection when it is most wanted.`);

  return {
    kind: "correlation",
    title: `How closely does it follow ${plan.benchmark}?`,
    stats:
      rows.length === 1
        ? [
            { label: "Correlation", value: num(lead.r), hint: `95% range ${num(lead.ci.lo)} to ${num(lead.ci.hi)}` },
            { label: "Beta", value: num(lead.reg.beta), hint: `A 1% move in ${plan.benchmark} comes with ${num(lead.reg.beta)}% here` },
            { label: "Explained by the benchmark", value: pct(lead.reg.r2, 0), hint: "Share of its swings" },
            { label: "Change in the window", value: `${num(lead.r1)} to ${num(lead.r2)}`, hint: "First half, then second" },
          ]
        : [],
    table:
      rows.length > 1
        ? {
            columns: ["Market", "Correlation", "Beta", "Beta on falls", "Beta on rises", "Explained"],
            rows: rows.map((r) => [r.coin, num(r.r), num(r.reg.beta), num(r.down.beta), num(r.up.beta), pct(r.reg.r2, 0)]),
          }
        : undefined,
    charts,
    cautions,
    method: `Regression of ${candleName(plan.interval)} returns on ${plan.benchmark} with Newey-West errors, separately for rising and falling ${plan.benchmark} candles. Correlation does not show which market leads or that one causes the other.`,
    tests,
    compose: (result) => {
      const linked = significant(result(`corr:${lead.coin}`));
      const strength = Math.abs(lead.r) >= 0.7 ? "closely" : Math.abs(lead.r) >= 0.4 ? "moderately" : "loosely";
      let headline = linked
        ? `${lead.coin} moves ${strength} with ${plan.benchmark} (correlation ${num(lead.r)}): a 1% move in ${plan.benchmark} comes with about ${num(lead.reg.beta)}% in ${lead.coin}, and ${plan.benchmark} accounts for ${pct(lead.reg.r2, 0)} of its swings.`
        : `The data does not show a dependable link between ${lead.coin} and ${plan.benchmark} over this window (correlation ${num(lead.r)}).`;
      if (significant(result(`asym:${lead.coin}`))) headline += ` It reacts ${lead.down.beta > lead.up.beta ? "harder to falls than to rises" : "harder to rises than to falls"}.`;
      if (significant(result(`shift:${lead.coin}`))) headline += ` The link ${lead.r2 > lead.r1 ? "strengthened" : "weakened"} during the window.`;
      return { headline, verdict: linked ? "clear" : "inconclusive" };
    },
  };
}

/* -------------------------------------------------------------------- signal */

export interface WalkForwardResult {
  net: number[];
  gross: number[];
  hold: number[];
  /** Index into the input returns where testing starts. */
  start: number;
  chosen: number[];
  trades: number;
  hitRate: number;
}

/**
 * Trade the sign of the past return, choosing the lookback only from data before
 * each test period. A position decided at the close of bar t earns bar t+1, so no
 * result can see the future. Costs apply on every change of position.
 */
export function walkForwardSignal(
  returns: readonly number[],
  funding: readonly number[],
  { mode, lookbacks, costPerSide, folds = 6, trainShare = 0.4 }: { mode: "momentum" | "reversion"; lookbacks: readonly number[]; costPerSide: number; folds?: number; trainShare?: number },
): WalkForwardResult {
  const n = returns.length;
  const prefix = [0];
  for (const r of returns) prefix.push(prefix[prefix.length - 1] + r);
  const flip = mode === "momentum" ? 1 : -1;
  /** Position held during bar t, decided from returns strictly before t. */
  const position = (t: number, l: number) => (t < l ? 0 : flip * Math.sign(prefix[t] - prefix[t - l]));
  const barNet = (t: number, l: number) => {
    const p = position(t, l);
    return p * returns[t] - Math.abs(p - position(t - 1, l)) * costPerSide - p * (funding[t] ?? 0);
  };

  const start = Math.max(Math.floor(n * trainShare), Math.max(...lookbacks) + 2);
  const size = Math.max(1, Math.floor((n - start) / folds));
  const out: WalkForwardResult = { net: [], gross: [], hold: [], start, chosen: [], trades: 0, hitRate: 0 };
  let hits = 0;
  let active = 0;
  let previous = 0;
  for (let f = 0; f < folds; f++) {
    const from = start + f * size;
    const to = f === folds - 1 ? n : from + size;
    let best = lookbacks[0];
    let bestScore = -Infinity;
    for (const l of lookbacks) {
      const train: number[] = [];
      for (let t = l + 1; t < from; t++) train.push(barNet(t, l));
      const s = std(train);
      const score = s > 0 ? mean(train) / s : -Infinity;
      if (score > bestScore) {
        bestScore = score;
        best = l;
      }
    }
    out.chosen.push(best);
    for (let t = from; t < to; t++) {
      const p = position(t, best);
      const gross = p * returns[t] - p * (funding[t] ?? 0);
      out.gross.push(gross);
      out.net.push(gross - Math.abs(p - previous) * costPerSide);
      out.hold.push(returns[t] - (funding[t] ?? 0));
      if (p !== previous) out.trades += Math.abs(p - previous);
      if (p !== 0) {
        active += 1;
        if (p * returns[t] > 0) hits += 1;
      }
      previous = p;
    }
  }
  out.hitRate = active ? hits / active : 0;
  return out;
}

const growth = (xs: readonly number[]) => {
  let v = 100;
  return [100, ...xs.map((r) => (v *= Math.exp(r)))];
};

export async function signal(ctx: AnalysisContext): Promise<Draft> {
  const { plan } = ctx;
  const interval: Interval = plan.days > 200 ? "4h" : "1h";
  const hoursPerBar = INTERVAL_MS[interval] / HOUR;
  const year = barsPerYear(interval);
  const wanted = Math.min(5000, Math.max(1500, Math.ceil((plan.days * DAY) / INTERVAL_MS[interval])));
  const fundingDays = Math.min(240, Math.ceil((wanted * INTERVAL_MS[interval]) / DAY));
  const grid = plan.signal.lookbackHours ? [plan.signal.lookbackHours] : [6, 12, 24, 48, 96, 168];
  const lookbacks = [...new Set(grid.map((h) => Math.max(1, Math.round(h / hoursPerBar))))];
  const name = plan.signal.mode === "momentum" ? "Momentum" : "Mean reversion";

  const rows = await Promise.all(
    plan.assets.slice(0, 3).map(async (coin) => {
      const bars = await ctx.data.candles(coin, interval, wanted);
      if (bars.length < 300) throw new Skip(`${coin} has only ${bars.length} ${candleName(interval)} candles; a signal test needs at least 300.`);
      const [funding, book] = await Promise.all([ctx.data.funding(coin, fundingDays), ctx.data.book(coin, null)]);
      const halfSpread = (bookStats(book.bids, book.asks)?.spreadBps ?? 2) / 2;
      const costBps = TAKER_FEE_BPS + halfSpread;
      const buckets = new Map<number, number>();
      for (const f of funding) {
        const bar = Math.floor(f.t / INTERVAL_MS[interval]) * INTERVAL_MS[interval];
        buckets.set(bar, (buckets.get(bar) ?? 0) + f.rate);
      }
      const rets = logReturns(closes(bars));
      const fundingPerBar = bars.slice(1).map((b) => buckets.get(b.t) ?? 0);
      const wf = walkForwardSignal(rets, fundingPerBar, { mode: plan.signal.mode, lookbacks, costPerSide: costBps / 1e4 });
      const sharpe = (xs: readonly number[]) => {
        const s = std(xs);
        return s > 0 ? (mean(xs) / s) * Math.sqrt(year) : 0;
      };
      const excess = wf.net.map((r, i) => r - wf.hold[i]);
      const lb = ljungBox(rets, 24);
      return {
        coin,
        bars,
        rets,
        wf,
        costBps,
        netTotal: Math.exp(wf.net.reduce((s, r) => s + r, 0)) - 1,
        grossTotal: Math.exp(wf.gross.reduce((s, r) => s + r, 0)) - 1,
        holdTotal: Math.exp(wf.hold.reduce((s, r) => s + r, 0)) - 1,
        sharpe: sharpe(wf.net),
        holdSharpe: sharpe(wf.hold),
        sharpeCI: blockBootstrapCI(wf.net, sharpe, { seed: ctx.seed }),
        netTest: hacMeanTest(wf.net),
        excessTest: hacMeanTest(excess),
        lb,
        acf: autocorrelations(rets, 24),
        fundingCovered: funding.length > 0,
      };
    }),
  );
  const lead = rows[0];
  const testDays = (lead.wf.net.length * INTERVAL_MS[interval]) / DAY;
  const offset = lead.bars.length - lead.wf.net.length - 1;
  const net = growth(lead.wf.net);
  const gross = growth(lead.wf.gross);
  const hold = growth(lead.wf.hold);
  const band = 1.96 / Math.sqrt(lead.rets.length);
  const chosenHours = [...new Set(lead.wf.chosen.map((l) => l * hoursPerBar))];

  return {
    kind: "signal",
    title: `Does ${name.toLowerCase()} work on live data?`,
    stats: [
      { label: "Signal, after all costs", value: signedPct(lead.netTotal), hint: `Over ${Math.round(testDays)} unseen days` },
      { label: "Simply holding", value: signedPct(lead.holdTotal), hint: "Same period, after funding" },
      { label: "Risk-adjusted return (Sharpe)", value: num(lead.sharpe), hint: `95% range ${num(lead.sharpeCI.lo)} to ${num(lead.sharpeCI.hi)}` },
      { label: "Lost to trading costs", value: pct(Math.max(0, lead.grossTotal - lead.netTotal)), hint: `${lead.wf.trades} position changes at ${num(lead.costBps, 1)} bps` },
    ],
    table:
      rows.length > 1
        ? {
            columns: ["Market", "Signal after costs", "Holding", "Sharpe", "95% range", "Right on"],
            rows: rows.map((r) => [r.coin, signedPct(r.netTotal), signedPct(r.holdTotal), num(r.sharpe), `${num(r.sharpeCI.lo)} to ${num(r.sharpeCI.hi)}`, pct(r.wf.hitRate, 0)]),
          }
        : undefined,
    charts: [
      {
        type: "line",
        title: `Growth of 100, ${lead.coin}, on data the signal never saw in training`,
        caption: "All three lines start at 100 at the beginning of the unseen period. The gap between the two signal lines is what trading costs took.",
        x: "time",
        format: "index",
        series: [
          { key: "net", label: "Signal after costs", color: 0 },
          { key: "gross", label: "Signal before trading costs", color: 2, dashed: true },
          { key: "hold", label: "Simply holding", color: "benchmark", dashed: true },
        ],
        points: thin(net.map((v, i) => ({ t: lead.bars[offset + i].t, net: round(v, 2), gross: round(gross[i], 2), hold: round(hold[i], 2) }))),
        guides: [{ value: 100, label: "Start" }],
      },
      {
        type: "bar",
        title: `Does the last move predict the next? ${lead.coin}`,
        caption: `Each bar compares returns with returns that many ${hoursPerBar === 1 ? "hours" : "4-hour candles"} earlier. Bars inside the dashed lines (±${num(band, 3)}) are what pure chance produces. A market with exploitable memory would show bars well outside them.`,
        format: "number",
        x: "category",
        points: lead.acf.map((v, i) => ({ x: String(i + 1), value: round(v, 4)!, tone: Math.abs(v) > band ? "highlight" : "muted" })),
        guides: [
          { value: round(band, 4)!, label: "" },
          { value: round(-band, 4)!, label: "" },
        ],
      },
    ],
    cautions: [
      `Tested on ${lead.wf.net.length.toLocaleString("en-US")} ${candleName(interval)} candles the signal did not see when ${plan.signal.lookbackHours ? "being set up" : "its lookback was chosen"}. One market regime is still one market regime; a different one can reverse this.`,
      "Costs use the taker fee and the spread at this moment. Larger orders would also pay market impact, which is not included.",
    ],
    method: `Holds long or short by the sign of the past return, ${plan.signal.lookbackHours ? `using the ${plan.signal.lookbackHours}-hour lookback you named` : `choosing among 6 to 168-hour lookbacks using only earlier data, refreshed across ${lead.wf.chosen.length} test periods (chosen: ${chosenHours.join(", ")} hours)`}. A position decided at one candle's close earns only the next candle. Includes actual hourly funding, a ${TAKER_FEE_BPS} bps taker fee and half the live spread on each change of position.`,
    tests: rows.flatMap((r) => [
      { id: `signal:${r.coin}`, question: `Does ${name.toLowerCase()} on ${r.coin} make money after costs?`, effect: `${signedPct(r.netTotal)}, Sharpe ${num(r.sharpe)}`, method: `${HAC}, out of sample`, p: r.netTest.p },
      { id: `signalhold:${r.coin}`, question: `Does it beat simply holding ${r.coin}?`, effect: `${signedPct(r.netTotal - r.holdTotal)} against holding`, method: `${HAC}, out of sample`, p: r.excessTest.p },
      { id: `memory:${r.coin}`, question: `Do past ${r.coin} returns predict the next ones at all?`, effect: `Largest link ${num(Math.max(...r.acf.map(Math.abs)), 3)}`, method: "Ljung-Box over 24 lags (can overstate when volatility clusters)", p: r.lb.p },
    ]),
    compose: (result) => {
      const works = significant(result(`signal:${lead.coin}`));
      const beats = significant(result(`signalhold:${lead.coin}`));
      let headline: string;
      if (works && lead.netTotal > 0) headline = `${name} on ${lead.coin} made ${signedPct(lead.netTotal)} after costs on unseen data, more than chance would explain${beats ? " and better than holding" : ", though not clearly better than holding"}.`;
      else if (works) headline = `${name} on ${lead.coin} lost money after costs (${signedPct(lead.netTotal)}), by more than chance would explain.`;
      else headline = `No evidence that ${name.toLowerCase()} works on ${lead.coin}: ${signedPct(lead.netTotal)} after costs on unseen data, against ${signedPct(lead.holdTotal)} for holding, and within what chance produces (95% Sharpe range ${num(lead.sharpeCI.lo)} to ${num(lead.sharpeCI.hi)}).`;
      return { headline, verdict: works ? "clear" : "inconclusive" };
    },
  };
}

/* ------------------------------------------------------------------- funding */

export async function fundingAnalysis(ctx: AnalysisContext): Promise<Draft> {
  const { plan, snapshot } = ctx;
  const days = Math.min(240, Math.ceil(plan.days));
  const base = BASE_FUNDING_HOURLY * 24 * 365;
  const rows = await Promise.all(
    plan.assets.map(async (coin) => {
      const funding = await ctx.data.funding(coin, days);
      if (funding.length < 48) throw new Skip(`${coin} has too little funding history for this window.`);
      const aprs = funding.map((f) => f.rate * 24 * 365);
      const test = hacMeanTest(aprs, base, Math.max(autoLag(aprs.length), 48));
      const bars = await ctx.data.candles(coin, "1h", Math.min(5000, days * 24 + 48));
      const prices = new Map(bars.map((b) => [b.t, b.c]));
      // Non-overlapping days: yesterday's average funding against today's return.
      const x: number[] = [];
      const y: number[] = [];
      const dayMap = new Map<number, number[]>();
      for (const f of funding) {
        const d = Math.floor(f.t / DAY) * DAY;
        dayMap.set(d, [...(dayMap.get(d) ?? []), f.rate * 24 * 365]);
      }
      const daily = [...dayMap.entries()].sort((a, b) => a[0] - b[0]).map(([t, v]) => ({ t, apr: mean(v) }));
      for (const d of daily) {
        const p0 = prices.get(d.t + DAY);
        const p1 = prices.get(d.t + 2 * DAY);
        if (p0 && p1) {
          x.push(d.apr);
          y.push(Math.log(p1 / p0));
        }
      }
      const predict = hacRegression(x, y);
      const snap = snapshot.find((s) => s.coin === coin);
      return {
        coin,
        funding,
        daily,
        test,
        predict,
        predictN: x.length,
        current: snap?.fundingApr ?? aprs[aprs.length - 1],
        oi: snap?.openInterestUsd ?? NaN,
        paid: funding.reduce((s, f) => s + f.rate, 0),
        atBase: funding.filter((f) => Math.abs(f.rate - BASE_FUNDING_HOURLY) < 1e-9).length / funding.length,
        positive: funding.filter((f) => f.rate > 0).length / funding.length,
      };
    }),
  );
  const lead = rows[0];

  return {
    kind: "funding",
    title: "Is positioning crowded?",
    stats:
      rows.length === 1
        ? [
            { label: "Funding now", value: signedPct(lead.current), hint: `A year's rate. Baseline: ${pct(base)}` },
            { label: "Average in the window", value: signedPct(lead.test.mean), hint: `${pct(lead.atBase, 0)} of hours sat at baseline` },
            { label: "Paid by longs in the window", value: signedPct(lead.paid, 2), hint: `Longs paid in ${pct(lead.positive, 0)} of hours` },
            { label: "Open interest", value: usd(lead.oi), hint: "Live value of open positions" },
          ]
        : [],
    table:
      rows.length > 1
        ? {
            columns: ["Market", "Funding now", "Average", "At baseline", "Paid by longs", "Open interest"],
            rows: rows.map((r) => [r.coin, signedPct(r.current), signedPct(r.test.mean), pct(r.atBase, 0), signedPct(r.paid, 2), usd(r.oi)]),
          }
        : undefined,
    charts: [
      {
        type: "bar",
        x: "time",
        format: "percent",
        title: `${lead.coin} daily average funding, as a yearly rate`,
        caption: "Funding is what one side of a perpetual pays the other. Above zero, longs pay shorts; well above the dashed baseline suggests traders are crowded into longs. Below zero, shorts pay longs.",
        points: thin(lead.daily, 200).map((d) => ({ x: d.t, value: round(d.apr, 4)!, tone: d.apr >= 0 ? "up" : "down" })),
        guides: [{ value: round(base, 4)!, label: "Baseline" }],
      },
    ],
    cautions: lead.atBase > 0.5 ? [`${pct(lead.atBase, 0)} of hours sat exactly at the baseline, which is the rate when no premium exists. Much of the average reflects that rule, not trader behaviour.`] : [],
    method: `Hourly funding, annualised and compared with the ${pct(base, 2)} baseline using a Newey-West test with at least 48 lags because funding is highly persistent. Prediction test: each day's average funding against the next day's return, on ${lead.predictN} non-overlapping days.`,
    tests: rows.flatMap((r) => [
      { id: `funding:${r.coin}`, question: `Is ${r.coin} funding different from the baseline?`, effect: `${signedPct(r.test.mean)} against ${pct(base)}`, method: "Newey-West t-test", p: r.test.p },
      { id: `fundpredict:${r.coin}`, question: `Does ${r.coin} funding predict the next day's return?`, effect: `Explains ${pct(Math.max(0, r.predict.r2), 1)} of next-day moves`, method: "Regression, Newey-West", p: r.predict.p },
    ]),
    compose: (result) => {
      const diff = significant(result(`funding:${lead.coin}`));
      const predicts = significant(result(`fundpredict:${lead.coin}`));
      let headline: string;
      if (diff && lead.test.mean > base) headline = `Longs are paying up on ${lead.coin}: funding averages ${signedPct(lead.test.mean)} a year, clearly above the ${pct(base)} baseline, which points to crowded long positioning.`;
      else if (diff) headline = `There is little appetite for leverage long on ${lead.coin}: funding averages ${signedPct(lead.test.mean)} a year, clearly below the ${pct(base)} baseline.`;
      else headline = `${lead.coin} funding shows no crowding: it averages ${signedPct(lead.test.mean)} a year, not distinguishable from the ${pct(base)} baseline.`;
      headline += predicts ? ` Funding has also had some value in predicting the next day's return.` : ` It has not predicted the next day's return.`;
      return { headline, verdict: diff ? "clear" : "inconclusive" };
    },
  };
}

/* ----------------------------------------------------------------- liquidity */

const depthWithin = (levels: Level[], mid: number, bps: number) => levels.filter((l) => (Math.abs(l.px - mid) / mid) * 1e4 <= bps).reduce((s, l) => s + l.px * l.sz, 0);

export async function liquidity(ctx: AnalysisContext): Promise<Draft> {
  const { plan, snapshot } = ctx;
  const sizes = [...new Set([10_000, 50_000, 100_000, 250_000, 500_000, 1_000_000, 5_000_000, plan.orderUsd])].sort((a, b) => a - b);
  const rows = await Promise.all(
    plan.assets.map(async (coin) => {
      const [fine, deep] = await Promise.all([ctx.data.book(coin, null), ctx.data.book(coin, 3)]);
      const stats = bookStats(fine.bids, fine.asks);
      if (!stats) throw new Skip(`The ${coin} order book is empty.`);
      const asks = mergeDepth(fine.asks, deep.asks, "ask");
      const bids = mergeDepth(fine.bids, deep.bids, "bid");
      const costs = sizes.map((size) => {
        const buy = executionCost(asks, size, stats.mid);
        const sell = executionCost(bids, size, stats.mid);
        return { size, buy: buy?.complete ? buy.costBps : null, sell: sell?.complete ? sell.costBps : null };
      });
      const wanted = costs.find((c) => c.size === plan.orderUsd)!;
      return {
        coin,
        stats,
        costs,
        wanted,
        d10: depthWithin(bids, stats.mid, 10) + depthWithin(asks, stats.mid, 10),
        d50: depthWithin(bids, stats.mid, 50) + depthWithin(asks, stats.mid, 50),
        volume: snapshot.find((s) => s.coin === coin)?.volumeUsd ?? NaN,
      };
    }),
  );
  const lead = rows[0];
  const money = usd(plan.orderUsd);
  const wantedAvg = (r: (typeof rows)[number]) => (r.wanted.buy !== null && r.wanted.sell !== null ? (r.wanted.buy + r.wanted.sell) / 2 : (r.wanted.buy ?? r.wanted.sell));
  const leadCost = wantedAvg(lead);
  const single = rows.length === 1;

  return {
    kind: "liquidity",
    title: `What would a ${money} order cost now?`,
    stats: single
      ? [
          { label: `${money} buy`, value: lead.wanted.buy === null ? "Beyond the book" : `${num(lead.wanted.buy, 2)} bps`, hint: "Above the mid price" },
          { label: `${money} sell`, value: lead.wanted.sell === null ? "Beyond the book" : `${num(lead.wanted.sell, 2)} bps`, hint: "Below the mid price" },
          { label: "Spread", value: `${num(lead.stats.spreadBps, 2)} bps`, hint: "Between best buy and sell" },
          { label: "Resting within 0.5%", value: usd(lead.d50), hint: `Within 0.1%: ${usd(lead.d10)}` },
        ]
      : [],
    table: single
      ? undefined
      : {
          columns: ["Market", `${money} buy`, `${money} sell`, "Spread", "Within 0.1%", "Within 0.5%", "24h volume"],
          rows: rows.map((r) => [r.coin, r.wanted.buy === null ? "Beyond the book" : `${num(r.wanted.buy, 2)} bps`, r.wanted.sell === null ? "Beyond the book" : `${num(r.wanted.sell, 2)} bps`, `${num(r.stats.spreadBps, 2)} bps`, usd(r.d10), usd(r.d50), usd(r.volume)]),
        },
    charts: [
      {
        type: "line",
        title: "Cost of a market order by size",
        caption: "Walks a real order through the live book. The line rises as a larger order uses up the best prices. A line that stops means the visible book could not fill that size. 1 bp is 0.01%.",
        x: "category",
        format: "bps",
        series: single
          ? [
              { key: "buy", label: "Buying", color: 0 },
              { key: "sell", label: "Selling", color: 1 },
            ]
          : rows.map((r, i) => ({ key: r.coin, label: r.coin, color: i })),
        points: sizes.map((size, i) => ({
          x: usd(size),
          ...(single
            ? { buy: round(lead.costs[i].buy ?? NaN, 2), sell: round(lead.costs[i].sell ?? NaN, 2) }
            : Object.fromEntries(rows.map((r) => {
                const c = r.costs[i];
                return [r.coin, c.buy !== null && c.sell !== null ? round((c.buy + c.sell) / 2, 2) : null];
              }))),
        })),
      },
    ],
    cautions: ["This is one instant of a book that changes many times a second, and it counts only resting orders that are visible. A large order would also move other traders' quotes."],
    method: `Walks each side of the book at ${new Date(ctx.now).toISOString().slice(11, 19)} UTC, extending the precise near-price book with a coarser, deeper one. Costs are measured from the mid price and exclude the ${TAKER_FEE_BPS} bps taker fee.`,
    tests: [],
    compose: () => ({
      headline:
        leadCost === null
          ? `The visible ${lead.coin} book could not fill a ${money} market order right now; it would need to be worked over time.`
          : `A ${money} market order in ${lead.coin} would cost about ${num(leadCost, 2)} bps right now (${usd((plan.orderUsd * leadCost) / 1e4)}), plus the ${TAKER_FEE_BPS} bps fee. That order is ${Number.isFinite(lead.volume) && lead.volume > 0 ? `${pct(plan.orderUsd / lead.volume, plan.orderUsd / lead.volume < 0.001 ? 3 : 2)} of 24-hour volume` : "small against the book"}.`,
      verdict: "measured",
    }),
  };
}

/* --------------------------------------------------------------- seasonality */

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export async function seasonality(ctx: AnalysisContext): Promise<Draft> {
  const { plan } = ctx;
  const rows = await Promise.all(
    plan.assets.map(async (coin) => {
      const bars = await ctx.data.candles(coin, "1h", 5000);
      if (bars.length < 24 * 21) throw new Skip(`${coin} has less than three weeks of hourly data.`);
      const rets = logReturns(closes(bars));
      const moves = rets.map((r, i) => ({ t: bars[i + 1].t, size: Math.abs(Math.exp(r) - 1) }));
      const byHour = Array.from({ length: 24 }, () => [] as number[]);
      const byDay = Array.from({ length: 7 }, () => [] as number[]);
      for (const m of moves) {
        const d = new Date(m.t);
        byHour[d.getUTCHours()].push(m.size);
        byDay[d.getUTCDay()].push(m.size);
      }
      const hourMeans = byHour.map(mean);
      const peak = hourMeans.indexOf(Math.max(...hourMeans));
      const trough = hourMeans.indexOf(Math.min(...hourMeans));
      const weekend = moves.filter((m) => [0, 6].includes(new Date(m.t).getUTCDay())).map((m) => m.size);
      const weekday = moves.filter((m) => ![0, 6].includes(new Date(m.t).getUTCDay())).map((m) => m.size);
      return { coin, bars, byHour, byDay, hourMeans, peak, trough, kw: kruskalWallis(byHour), weekend: mean(weekend), weekday: mean(weekday), wk: hacDiffTest(weekend, weekday) };
    }),
  );
  const lead = rows[0];
  const hourLabel = (h: number) => `${String(h).padStart(2, "0")}:00`;
  const weeks = Math.round(lead.bars.length / 168);

  return {
    kind: "seasonality",
    title: "When does it move most?",
    stats: [
      { label: "Busiest hour", value: `${hourLabel(lead.peak)} UTC`, hint: `Average move ${pct(lead.hourMeans[lead.peak], 2)}` },
      { label: "Quietest hour", value: `${hourLabel(lead.trough)} UTC`, hint: `Average move ${pct(lead.hourMeans[lead.trough], 2)}` },
      { label: "Busiest against quietest", value: `${num(lead.hourMeans[lead.peak] / lead.hourMeans[lead.trough], 1)}x` },
      { label: "Weekends against weekdays", value: signedPct(lead.weekend / lead.weekday - 1, 0), hint: "Size of the average hourly move" },
    ],
    table:
      rows.length > 1
        ? { columns: ["Market", "Busiest hour (UTC)", "Quietest hour (UTC)", "Busiest against quietest", "Weekends against weekdays"], rows: rows.map((r) => [r.coin, hourLabel(r.peak), hourLabel(r.trough), `${num(r.hourMeans[r.peak] / r.hourMeans[r.trough], 1)}x`, signedPct(r.weekend / r.weekday - 1, 0)]) }
        : undefined,
    charts: [
      {
        type: "bar",
        x: "category",
        format: "percent",
        title: `${lead.coin}: average hourly move by hour of day (UTC)`,
        caption: "Taller bars mean larger price moves in that hour, in either direction. The darkest bar is the busiest hour.",
        points: lead.hourMeans.map((v, h) => ({ x: hourLabel(h), value: round(v, 5)!, tone: h === lead.peak ? "highlight" : "muted" })),
      },
      {
        type: "bar",
        x: "category",
        format: "percent",
        title: `${lead.coin}: average hourly move by day of week (UTC)`,
        caption: "The same measure across the week.",
        points: [1, 2, 3, 4, 5, 6, 0].map((d) => ({ x: WEEKDAYS[d], value: round(mean(lead.byDay[d]), 5)!, tone: d === 0 || d === 6 ? "muted" : "highlight" })),
      },
    ],
    cautions: ["This measures how much the price moves, not which way. Average hourly direction is too noisy to read a pattern from."],
    method: `Uses the last ${weeks} weeks of hourly candles regardless of the window asked for, since a daily pattern needs many days. Kruskal-Wallis tests whether the 24 hours share one distribution, without assuming a bell curve.`,
    tests: rows.flatMap((r) => [
      { id: `hours:${r.coin}`, question: `Does the size of ${r.coin}'s moves depend on the hour?`, effect: `${num(r.hourMeans[r.peak] / r.hourMeans[r.trough], 1)}x between busiest and quietest`, method: "Kruskal-Wallis", p: r.kw.p },
      { id: `weekend:${r.coin}`, question: `Are ${r.coin}'s weekends different from weekdays?`, effect: `${signedPct(r.weekend / r.weekday - 1, 0)} on weekends`, method: "Difference in means, Newey-West", p: r.wk.p },
    ]),
    compose: (result) => {
      const real = significant(result(`hours:${lead.coin}`));
      const wk = significant(result(`weekend:${lead.coin}`));
      return {
        headline: `${real ? `${lead.coin} has a real daily rhythm` : `The data does not show a dependable daily rhythm in ${lead.coin}`}: moves are largest around ${hourLabel(lead.peak)} UTC (${pct(lead.hourMeans[lead.peak], 2)} on average) and smallest around ${hourLabel(lead.trough)} UTC (${pct(lead.hourMeans[lead.trough], 2)}).${wk ? ` Weekends are ${lead.weekend < lead.weekday ? "clearly quieter" : "clearly busier"} than weekdays.` : ""}`,
        verdict: real ? "clear" : "inconclusive",
      };
    },
  };
}

/* --------------------------------------------------------------------- range */

export async function range(ctx: AnalysisContext): Promise<Draft> {
  const { plan, snapshot } = ctx;
  const h = Math.round(plan.horizonDays);
  const rows = await Promise.all(
    plan.assets.map(async (coin, i) => {
      const bars = await ctx.data.candles(coin, "1d", 800);
      if (bars.length < 240) throw new Skip(`${coin} has only ${bars.length} days of history; a range needs at least 240.`);
      const rets = logReturns(closes(bars));
      const sims = simulateRange(rets, h, { paths: 2000, seed: ctx.seed + i });
      const price = snapshot.find((s) => s.coin === coin)?.price ?? bars[bars.length - 1].c;
      const fan = sims.map((row) => {
        const sorted = [...row].sort((a, b) => a - b);
        const at = (q: number) => price * Math.exp(quantile(sorted, q));
        return { p5: at(0.05), p25: at(0.25), p50: at(0.5), p75: at(0.75), p95: at(0.95) };
      });
      const finals = sims[h];
      const share = (test: (r: number) => boolean) => finals.filter((v) => test(Math.exp(v) - 1)).length / finals.length;
      return { coin, price, fan, days: bars.length, down20: share((r) => r <= -0.2), up20: share((r) => r >= 0.2), coverage: rangeCoverage(rets, h) };
    }),
  );
  const lead = rows[0];
  const end = lead.fan[h];
  // A range does not need the feed's five significant figures.
  const fmt = (v: number) => `$${formatPrice(v, lead.price * 10)}`;

  const cautions = [`This describes a range, not a prediction. It removes any direction and assumes behaviour stays like the past ${lead.days} days; a new kind of shock would fall outside it.`];
  const missed = lead.coverage.rate < 0.8;
  if (missed) cautions.push(`The band has been too narrow historically (it held ${pct(lead.coverage.rate, 0)} of the time, not 90%), so treat the real risk as wider.`);

  return {
    kind: "range",
    title: `Where could ${lead.coin} be in ${h} days?`,
    stats: [
      { label: "Likely range (90%)", value: `${fmt(end.p5)} to ${fmt(end.p95)}`, hint: `From ${fmt(lead.price)} today` },
      { label: "Middle half", value: `${fmt(end.p25)} to ${fmt(end.p75)}` },
      { label: "Chance of a fall of 20% or more", value: pct(lead.down20, 0), hint: `Rise of 20% or more: ${pct(lead.up20, 0)}` },
      { label: "Track record of this band", value: pct(lead.coverage.rate, 0), hint: `Held in ${lead.coverage.inside} of ${lead.coverage.checks} past checks; aim is 90%` },
    ],
    table:
      rows.length > 1
        ? {
            columns: ["Market", "Today", "Likely range (90%)", "Fall of 20%+", "Rise of 20%+", "Track record"],
            rows: rows.map((r) => [r.coin, `$${formatPrice(r.price)}`, `$${formatPrice(r.fan[h].p5, r.price * 10)} to $${formatPrice(r.fan[h].p95, r.price * 10)}`, pct(r.down20, 0), pct(r.up20, 0), pct(r.coverage.rate, 0)]),
          }
        : undefined,
    charts: [
      {
        type: "fan",
        format: "price",
        title: `Range of outcomes for ${lead.coin} over ${h} days`,
        caption: "The wide band holds 90% of simulated outcomes and the dark band holds 50%. It widens because uncertainty grows with time. The middle line is not a forecast; direction was removed on purpose.",
        points: lead.fan.map((f, day) => ({ day, p5: round(f.p5, 6)!, p25: round(f.p25, 6)!, p50: round(f.p50, 6)!, p75: round(f.p75, 6)!, p95: round(f.p95, 6)! })),
      },
    ],
    cautions,
    method: `Filtered historical simulation on ${lead.days} daily returns: 2,000 paths replaying past shocks at today's volatility (EWMA, lambda 0.94), with average drift removed. Track record re-runs this at ${lead.coverage.checks} past dates using only the data available then. Those checks overlap, so they are less independent than the count suggests.`,
    tests: [],
    compose: () => ({
      headline: `Based on how ${lead.coin} behaves now, 90% of ${h}-day outcomes fall between ${fmt(end.p5)} and ${fmt(end.p95)}, from ${fmt(lead.price)} today. Measured against history, this band held ${pct(lead.coverage.rate, 0)} of the time against a 90% aim.`,
      verdict: "measured",
    }),
  };
}

/* ----------------------------------------------------------------------- mev */

export async function mev(ctx: AnalysisContext): Promise<Draft> {
  const epochs = await ctx.data.epochs(41);
  const ordered = [...epochs.data].sort((a, b) => a.epoch - b.epoch);
  const ids = ordered.map((e) => e.epoch);
  const { starts } = await ctx.data.epochStarts([...ids, ids[ids.length - 1] + 1]);
  const bars = await ctx.data.candles("SOL", "1h", 1500);

  const rows = ordered.flatMap((e) => {
    const from = starts.get(e.epoch)!;
    const to = starts.get(e.epoch + 1)!;
    if (to > ctx.now) return []; // Still in progress.
    const inside = bars.filter((b) => b.t >= from && b.t < to);
    if (inside.length < 12 || !(e.totalMevSol > 0)) return [];
    const rets = logReturns(closes(inside));
    const hours = (to - from) / HOUR;
    return [{ epoch: e.epoch, t: from, mev: e.totalMevSol, mevPerDay: e.totalMevSol / (hours / 24), vol: std(rets) * Math.sqrt(24 * 365), volumeUsd: inside.reduce((s, b) => s + b.v * b.c, 0) / (hours / 24) }];
  });
  if (rows.length < 15) throw new Skip(`Only ${rows.length} finished epochs line up with price data; at least 15 are needed.`);

  const mevs = rows.map((r) => r.mevPerDay);
  const vols = rows.map((r) => r.vol);
  const volumes = rows.map((r) => r.volumeUsd);
  const level = spearman(vols, mevs);
  const byVolume = spearman(volumes, mevs);
  const diff = (xs: number[]) => xs.slice(1).map((v, i) => Math.log(v / xs[i]));
  const changes = spearman(diff(vols), diff(mevs));
  const elasticity = hacRegression(vols.map(Math.log), mevs.map(Math.log), 2);
  const days = rows.map((r) => r.mevPerDay);
  const fitPoints = [Math.min(...vols), Math.max(...vols)].map((v) => ({ x: round(v, 4)!, y: round(Math.exp(elasticity.alpha) * v ** elasticity.beta, 2)! }));
  const baseVol = vols[0];
  const baseMev = mevs[0];

  return {
    kind: "mev",
    title: "Does Solana MEV rise with volatility?",
    stats: [
      { label: "Link between volatility and MEV", value: num(level.rho), hint: `Rank correlation, ${rows.length} epochs` },
      { label: "Epoch-to-epoch changes", value: num(changes.rho), hint: "The stricter test" },
      { label: "MEV and trading activity", value: num(byVolume.rho), hint: "Rank correlation with SOL perp volume" },
      { label: "Average MEV", value: `${num(mean(days), 0)} SOL/day`, hint: "Across Jito-Solana validators" },
    ],
    charts: [
      {
        type: "scatter",
        title: "Each dot is one finished Solana epoch",
        caption: "Further right means SOL was more volatile during that epoch; higher means validators earned more MEV per day. Dots rising to the right would mean volatile markets pay more.",
        xLabel: "SOL volatility, annualised",
        yLabel: "MEV, SOL per day",
        xFormat: "percent0",
        yFormat: "sol",
        points: rows.map((r) => ({ x: round(r.vol, 4)!, y: round(r.mevPerDay, 1)!, label: `Epoch ${r.epoch}` })),
        fit: fitPoints,
      },
      {
        type: "line",
        title: "Volatility and MEV together, both starting at 100",
        caption: "Both series are rescaled to start at 100 so their shapes can be compared on one axis.",
        x: "time",
        format: "index",
        series: [
          { key: "mev", label: "MEV per day", color: 0 },
          { key: "vol", label: "SOL volatility", color: 1 },
        ],
        points: rows.map((r) => ({ t: r.t, mev: round((r.mevPerDay / baseMev) * 100, 1), vol: round((r.vol / baseVol) * 100, 1) })),
        guides: [{ value: 100, label: "Start" }],
      },
    ],
    cautions: [`Epoch dates come from Solana block times (${rows.length} finished epochs, roughly ${Math.round((rows[rows.length - 1].t - rows[0].t) / DAY)} days). One shock can dominate a sample this short, and the link does not show that volatility causes MEV, since heavy on-chain activity can drive both.`],
    method: "Total network MEV per day in each finished epoch against realised SOL volatility over the same dates. Spearman rank correlation on levels, then on epoch-to-epoch changes, which removes any shared drift. Log-log slope with Newey-West errors gives the implied sensitivity.",
    tests: [
      { id: "mev:level", question: "Do more volatile epochs earn more MEV?", effect: `Rank correlation ${num(level.rho)}`, method: "Spearman", p: level.p },
      { id: "mev:changes", question: "When volatility changes, does MEV change with it?", effect: `Rank correlation ${num(changes.rho)}`, method: "Spearman on changes", p: changes.p },
      { id: "mev:volume", question: "Do epochs with more SOL perp trading earn more MEV?", effect: `Rank correlation ${num(byVolume.rho)}`, method: "Spearman", p: byVolume.p },
    ],
    compose: (result) => {
      const lvl = significant(result("mev:level"));
      const chg = significant(result("mev:changes"));
      const headline =
        lvl && chg
          ? `Yes: more volatile epochs earn more MEV (rank correlation ${num(level.rho)}), and the link holds in epoch-to-epoch changes (${num(changes.rho)}). A 10% rise in SOL volatility has gone with about ${signedPct(1.1 ** elasticity.beta - 1, 0)} in daily MEV.`
          : lvl
            ? `More volatile epochs have earned more MEV (rank correlation ${num(level.rho)}), but the link does not hold in epoch-to-epoch changes (${num(changes.rho)}), so a shared drift may explain part of it.`
            : chg
              ? `Partly: when SOL volatility jumps from one epoch to the next, MEV tends to jump with it (rank correlation ${num(changes.rho)}), but calmer periods do not reliably earn less overall (${num(level.rho)}) over these ${rows.length} epochs.`
              : `Over the last ${rows.length} finished epochs the data does not show MEV rising with SOL volatility (rank correlation ${num(level.rho)}, or ${num(changes.rho)} in changes).`;
      const volume = significant(result("mev:volume")) ? ` MEV also tracks SOL trading activity (${num(byVolume.rho)}).` : "";
      return { headline: headline + volume, verdict: lvl || chg ? "clear" : "inconclusive" };
    },
  };
}

/* ---------------------------------------------------------------- correction */

/** Correct all tests together, then let each draft write its finding. */
export function finalize(drafts: Draft[]): { findings: Finding[]; tests: EvidenceTest[]; demoted: number } {
  const raw = drafts.flatMap((d) => d.tests);
  const adjusted = benjaminiHochberg(raw.map((t) => t.p));
  const tests: EvidenceTest[] = raw.map((t, i) => ({ ...t, pAdjusted: adjusted[i], significant: adjusted[i] < 0.05 }));
  const byId = new Map(tests.map((t) => [t.id, t]));
  const findings: Finding[] = drafts.map((d) => {
    const { headline, verdict } = d.compose((id) => byId.get(id));
    return { kind: d.kind, title: d.title, stats: d.stats, table: d.table, charts: d.charts, cautions: d.cautions, method: d.method, headline, verdict, testIds: d.tests.map((t) => t.id) };
  });
  return { findings, tests, demoted: tests.filter((t) => t.p < 0.05 && !t.significant).length };
}

export const ANALYSES: Record<AnalysisKind, (ctx: AnalysisContext) => Promise<Draft>> = {
  trend,
  volatility,
  distribution,
  drawdown,
  correlation: correlationAnalysis,
  signal,
  funding: fundingAnalysis,
  liquidity,
  seasonality,
  range,
  mev,
};
