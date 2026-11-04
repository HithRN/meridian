/**
 * Turn a question in everyday language into a research plan. Rule-based on
 * purpose: the same words always give the same plan, every assumption is written
 * down for the reader, and the page lets them correct it.
 */

import type { Interval } from "@/core/market/book";
import { ANALYSIS_KINDS, type AnalysisKind, type PlanOverrides, type ResearchPlan, type SignalSpec } from "@/core/market/research/types";

const NAME_ALIASES: Record<string, string> = {
  bitcoin: "BTC",
  btc: "BTC",
  ethereum: "ETH",
  ether: "ETH",
  eth: "ETH",
  solana: "SOL",
  sol: "SOL",
  jito: "JTO",
  jto: "JTO",
  jitosol: "SOL",
  jupiter: "JUP",
  jup: "JUP",
  hyperliquid: "HYPE",
  hype: "HYPE",
  ripple: "XRP",
  xrp: "XRP",
  dogecoin: "DOGE",
  doge: "DOGE",
  avalanche: "AVAX",
  avax: "AVAX",
  chainlink: "LINK",
  sui: "SUI",
  aptos: "APT",
  arbitrum: "ARB",
  optimism: "OP",
  bonk: "kBONK",
  pepe: "kPEPE",
  shib: "kSHIB",
  wif: "WIF",
  raydium: "RAY",
};

/** Capitalised words that are not tickers, even where a ticker shares the spelling. */
const NOT_TICKERS = new Set(
  "A I AI US IS OR IN ON TO IT MY VS ME DO BE AT OF UP NO IF AN AS BY GO SO TA THE AND FOR ARE WAS CAN HOW WHY WHO WHAT WHEN DOES WILL NOT ALL ANY MEV APR APY USD USDC USDT PNL CEO ATH ATL VWAP TWAP RSI MACD OI BPS HFT OK MM FX UTC GDP FOMC CPI DEX CEX NFT DEFI LP TVL PDF CSV ETF VAR CVAR HODL NOW OUT TOP LOW HIGH NEXT LAST PAST".split(" "),
);

const INTENTS: Array<{ kind: AnalysisKind; pattern: RegExp }> = [
  { kind: "signal", pattern: /momentum|mean[- ]?rever|reversion|signal|strategy|back-?test|predict|trend[- ]follow|profitable|autocorrelat/i },
  { kind: "mev", pattern: /\bmev\b|\btips?\b|validator|stakers?\b|bundles?\b|jitosol/i },
  { kind: "funding", pattern: /funding|carry|basis|crowded|positioning|open interest|\boi\b|leverage|longs?\b.*\bshorts?\b/i },
  { kind: "liquidity", pattern: /liquidity|liquid\b|slippage|execut|order book|\bdepth\b|\bspread\b|market impact|\border\b|enter a position/i },
  { kind: "seasonality", pattern: /time of day|hours? of|which hours?|what hours?|what time|session|weekend|weekday|seasonal|day of the week|asia|london|new york/i },
  { kind: "range", pattern: /where could|where will|how (high|low|far)|forecast|scenario|\bnext \d+|\bcoming \d+|\bin \d+ (day|week|month)|price range|expected range|could (it )?(fall|drop|rise)/i },
  { kind: "correlation", pattern: /correlat|move[sd]? (with|together)|moving with|\bbeta\b|diversif|decoupl|hedg|relationship|depend/i },
  { kind: "distribution", pattern: /\btails?\b|crash|black swan|extreme|worst case|value at risk|\bvar\b|expected shortfall|fat[- ]tail|outlier|distribution/i },
  { kind: "drawdown", pattern: /drawdown|draw down|from (the |its )?(peak|high|top)|underwater|recover/i },
  { kind: "volatility", pattern: /volatil|\brisk(y|ier)?\b|calm|choppy|turbulen|wild|regime|stable/i },
  { kind: "trend", pattern: /trend|direction|going up|going down|\bbull|\bbear|rally|dump|perform|stronger|weaker|how is .* doing/i },
];

/** Weaker words count as a question about direction only if nothing else was asked. */
const WEAK_TREND = /\breturns?\b|\bgains?\b|\bfall|\brising\b|\b(up|down)\b/i;

/** These analyses already answer the other one, so it would only repeat them. */
const COVERED_BY: Partial<Record<AnalysisKind, AnalysisKind[]>> = {
  seasonality: ["volatility"],
  mev: ["volatility", "signal"],
  funding: ["signal"],
};

const COMPANIONS: Partial<Record<AnalysisKind, AnalysisKind[]>> = {
  trend: ["drawdown"],
  volatility: ["distribution"],
  drawdown: ["trend"],
};

const OVERVIEW: AnalysisKind[] = ["trend", "volatility", "correlation", "funding", "liquidity"];

export function intervalForDays(days: number): Interval {
  if (days <= 2) return "5m";
  if (days <= 7) return "15m";
  if (days <= 45) return "1h";
  if (days <= 200) return "4h";
  return "1d";
}

const UNIT_DAYS: Record<string, number> = { hour: 1 / 24, day: 1, week: 7, month: 30, quarter: 91, year: 365 };

function parseSignal(q: string): SignalSpec {
  const mode = /mean[- ]?rever|reversion|revert/i.test(q) ? "reversion" : "momentum";
  const m = q.match(/(\d+)[- ]?(hour|hr|day|week|h|d)s?[- ]+(?:price )?(momentum|mean|reversion|signal|trend|lookback)/i);
  if (!m) return { mode, lookbackHours: null };
  const unit = m[2].toLowerCase();
  const hours = unit.startsWith("h") ? 1 : unit.startsWith("w") ? 168 : 24;
  return { mode, lookbackHours: Number(m[1]) * hours };
}

function parseDays(text: string, now: number): number | null {
  const named = text.match(/\b(?:last|past|previous|recent|over|for|in the last|over the last)\s+(?:the\s+)?(?:last\s+|past\s+)?(\d+)\s*-?\s*(hour|day|week|month|quarter|year)s?\b/i);
  if (named) return Number(named[1]) * UNIT_DAYS[named[2].toLowerCase()];
  const compact = text.match(/\b(?:last|past|over)\s+(\d+)(h|d|w|y)\b/i);
  if (compact) return Number(compact[1]) * { h: 1 / 24, d: 1, w: 7, y: 365 }[compact[2].toLowerCase() as "h" | "d" | "w" | "y"];
  if (/\b(today|24 ?hours?|past day|last day)\b/i.test(text)) return 1;
  if (/\b(this|last|past) week\b/i.test(text)) return 7;
  if (/\b(this|last|past) month\b/i.test(text)) return 30;
  if (/\b(this|last|past) quarter\b/i.test(text)) return 91;
  if (/\b(last|past) year\b/i.test(text)) return 365;
  if (/\b(this year|ytd|year to date)\b/i.test(text)) {
    const y = new Date(now).getUTCFullYear();
    return Math.max(7, Math.ceil((now - Date.UTC(y, 0, 1)) / 86_400_000));
  }
  return null;
}

function parseHorizon(text: string): number | null {
  const m = text.match(/\b(?:next|coming|in|within)\s+(?:the\s+)?(?:next\s+)?(\d+)\s*-?\s*(day|week|month)s?\b/i);
  if (m) return Number(m[1]) * UNIT_DAYS[m[2].toLowerCase()];
  if (/\bnext (week)\b/i.test(text)) return 7;
  if (/\bnext (month)\b/i.test(text)) return 30;
  if (/\bnext (quarter)\b/i.test(text)) return 91;
  return null;
}

function parseOrderSize(text: string): number | null {
  const m = text.match(/\$\s?([\d,.]+)\s*(k|m|b|thousand|million|billion)?\b/i);
  if (!m) return null;
  const v = Number(m[1].replace(/,/g, ""));
  if (!(v > 0)) return null;
  const unit = (m[2] ?? "").toLowerCase()[0];
  return v * (unit === "k" || unit === "t" ? 1e3 : unit === "m" ? 1e6 : unit === "b" ? 1e9 : 1);
}

export function parseAssets(question: string, universe: ReadonlySet<string>): { assets: string[]; unknown: string[] } {
  const found: Array<{ at: number; coin: string }> = [];
  const unknown = new Set<string>();

  for (const m of question.matchAll(/[A-Za-z][A-Za-z0-9]*/g)) {
    const coin = NAME_ALIASES[m[0].toLowerCase()];
    if (coin && universe.has(coin)) found.push({ at: m.index, coin });
  }
  for (const m of question.matchAll(/\$?\b[A-Z][A-Z0-9]{1,9}\b/g)) {
    const token = m[0].replace("$", "");
    if (NAME_ALIASES[token.toLowerCase()]) continue;
    if (universe.has(token) && !NOT_TICKERS.has(token)) found.push({ at: m.index, coin: token });
    else if (!NOT_TICKERS.has(token) && token.length >= 3) unknown.add(token);
  }

  const assets = [...new Set(found.sort((a, b) => a.at - b.at).map((f) => f.coin))];
  return { assets, unknown: [...unknown] };
}

export function buildPlan(question: string, universe: ReadonlySet<string>, now = Date.now(), overrides: PlanOverrides = {}): ResearchPlan {
  const notes: string[] = [];
  const { assets: named, unknown } = parseAssets(question, universe);

  // Remove phrases whose numbers mean something else before reading the window.
  const horizon = parseHorizon(question);
  const signal = parseSignal(question);
  const windowText = question
    .replace(/(\d+)[- ]?(hour|hr|day|week|h|d)s?[- ]+(?:price )?(momentum|mean|reversion|signal|trend|lookback)/gi, " ")
    .replace(/\b(?:next|coming|in|within)\s+(?:the\s+)?(?:next\s+)?\d+\s*-?\s*(?:day|week|month)s?\b/gi, " ");
  const parsedDays = parseDays(windowText, now);

  // Find what is being asked, keeping the order the question raised it.
  let asked = INTENTS.map(({ kind, pattern }) => ({ kind, at: question.search(pattern) }))
    .filter((i) => i.at >= 0)
    .sort((a, b) => a.at - b.at)
    .map((i) => i.kind);
  const namesSignal = /momentum|mean[- ]?rever|reversion|back-?test|strategy/i.test(question);
  for (const [kind, covered] of Object.entries(COVERED_BY)) {
    if (asked.includes(kind as AnalysisKind)) asked = asked.filter((a) => !covered.includes(a) || (a === "signal" && namesSignal));
  }
  if (!asked.length && WEAK_TREND.test(question)) asked = ["trend"];

  let analyses: AnalysisKind[] = [];
  if (/\bshould i\b|\bbuy or sell\b|\bgood (time|entry)\b|\bprice target\b/i.test(question)) {
    notes.push("Meridian measures what the market is doing and does not say what to buy or sell. This report shows the evidence that bears on the decision.");
    analyses = ["trend", "volatility", "range", "liquidity"];
  } else if (asked.length) {
    analyses = [...asked];
    for (const kind of asked) for (const extra of COMPANIONS[kind] ?? []) if (asked.length === 1 && !analyses.includes(extra)) analyses.push(extra);
  } else if (named.length >= 2) {
    analyses = ["trend", "correlation", "volatility"];
    notes.push("Read as a comparison of the named markets.");
  } else {
    analyses = [...OVERVIEW];
    notes.push("No specific topic recognised, so this is a general review of the market. Choose topics below to focus it.");
  }
  if (overrides.analyses?.length) analyses = overrides.analyses.filter((k) => ANALYSIS_KINDS.includes(k));

  // Assets.
  let assets = named;
  if (analyses.includes("mev") && !assets.includes("SOL")) assets = ["SOL", ...assets];
  if (overrides.assets?.length) assets = overrides.assets.filter((a) => universe.has(a));
  if (!assets.length && unknown.length === 0) {
    assets = ["SOL"];
    notes.push("No market named, so this uses SOL.");
  }
  if (assets.length > 5) {
    notes.push(`Limited to five markets: ${assets.slice(0, 5).join(", ")}.`);
    assets = assets.slice(0, 5);
  }
  if (/jitosol/i.test(question)) notes.push("JitoSOL has no perpetual market, so SOL stands in for its price.");

  // Window.
  let days = overrides.days ?? parsedDays ?? 90;
  const usesWindow = analyses.some((k) => ["trend", "volatility", "distribution", "drawdown", "correlation", "funding"].includes(k));
  if (overrides.days === undefined && parsedDays === null && usesWindow) notes.push("No time window given, so this covers the last 90 days.");
  days = Math.max(1, Math.min(730, days));

  const benchmark = assets.includes("BTC") && assets[0] === "BTC" ? (assets.find((a) => a !== "BTC") ?? "ETH") : "BTC";
  if (analyses.includes("correlation") && !assets.includes(benchmark)) notes.push(`${benchmark} is the comparison market.`);

  return {
    question,
    assets,
    benchmark,
    days,
    interval: intervalForDays(days),
    horizonDays: Math.max(1, Math.min(180, horizon ?? 30)),
    orderUsd: parseOrderSize(question) ?? 100_000,
    signal,
    analyses: [...new Set(analyses)],
    notes,
    unknownAssets: unknown.filter((u) => !assets.includes(u)),
  };
}
