/**
 * JitoSOL yield analytics.
 *
 * JitoSOL is a liquid staking token whose exchange rate accrues both protocol
 * staking rewards and MEV tips redistributed by Jito-Solana validators. This
 * module decomposes the pool's reported APY into an estimated MEV component
 * (reported MEV rewards ÷ TVL, annualised) and projects a position forward.
 *
 * Inputs come from Jito's public stake-pool stats API when reachable, otherwise
 * from the bundled snapshot below (captured from the same API on 2026-11-02),
 * and every output carries its source. Projections are arithmetic on reported
 * figures — not a forecast, and not investment advice.
 */

import { LAMPORTS_PER_SOL } from "@/core/solana/tips";

export interface DatedValue {
  date: string;
  value: number;
}

export interface StakePoolStats {
  apy: number; // latest reported APY (fraction)
  apySeries: DatedValue[];
  tvlSol: number;
  supplyJitoSol: number;
  numValidators: number;
  /** Daily MEV rewards to the pool, in SOL. */
  mevRewardsSol: DatedValue[];
  source: "live" | "snapshot";
  asOf: string;
}

/** Captured from kobe.mainnet.jito.network/api/v1/stake_pool_stats on 2026-11-02. */
export const BUNDLED_STAKE_POOL: StakePoolStats = {
  apy: 0.0472825597519011,
  apySeries: [
    { date: "2026-10-27", value: 0.0474 },
    { date: "2026-10-28", value: 0.0471 },
    { date: "2026-10-29", value: 0.0476 },
    { date: "2026-10-30", value: 0.0473 },
    { date: "2026-10-31", value: 0.0470 },
    { date: "2026-11-01", value: 0.0472 },
    { date: "2026-11-02", value: 0.0473 },
  ],
  tvlSol: 10_313_232.48,
  supplyJitoSol: 7_875_778.65,
  numValidators: 659,
  mevRewardsSol: [
    { date: "2026-10-26", value: 200.46 },
    { date: "2026-10-27", value: 74.9 },
    { date: "2026-10-28", value: 1356.27 },
    { date: "2026-10-29", value: 1471.51 },
    { date: "2026-10-30", value: 916.58 },
    { date: "2026-10-31", value: 643.31 },
    { date: "2026-11-01", value: 674.82 },
  ],
  source: "snapshot",
  asOf: "2026-11-02T16:21:33Z",
};

/** Parse the raw stake_pool_stats payload (lamport-denominated) into SOL units. */
export function parseStakePoolStats(raw: unknown): StakePoolStats | null {
  type Series = Array<{ data: number; date: string }>;
  const r = raw as { apy?: Series; tvl?: Series; supply?: Series; num_validators?: Series; mev_rewards?: Series };
  if (!r?.apy?.length || !r.tvl?.length || !r.mev_rewards?.length) return null;
  const last = <T,>(s: T[]) => s[s.length - 1];
  const day = (d: string) => d.slice(0, 10);
  const today = day(last(r.mev_rewards).date);
  // The newest MEV point is usually a partial day; drop it from daily figures.
  const mev = r.mev_rewards.filter((p, i, a) => i < a.length - 1 || day(p.date) !== today);
  return {
    apy: last(r.apy).data,
    apySeries: r.apy.map((p) => ({ date: day(p.date), value: p.data })),
    tvlSol: last(r.tvl).data / LAMPORTS_PER_SOL,
    supplyJitoSol: r.supply?.length ? last(r.supply).data : 0,
    numValidators: r.num_validators?.length ? last(r.num_validators).data : 0,
    mevRewardsSol: mev.map((p) => ({ date: day(p.date), value: p.data / LAMPORTS_PER_SOL })),
    source: "live",
    asOf: last(r.apy).date,
  };
}

/** Annualised MEV contribution: mean daily MEV rewards × 365 ÷ TVL. */
export function mevApyEstimate(stats: StakePoolStats): number {
  if (!stats.mevRewardsSol.length || stats.tvlSol <= 0) return 0;
  const mean = stats.mevRewardsSol.reduce((s, p) => s + p.value, 0) / stats.mevRewardsSol.length;
  return Math.min(stats.apy, (mean * 365) / stats.tvlSol);
}

export interface YieldProjection {
  amountSol: number;
  days: number;
  apy: number;
  mevApy: number;
  jitoSolEnd: number;
  /** Same stake compounding at APY − MEV component (i.e. without MEV rewards). */
  nativeStakeEnd: number;
  mevUpliftSol: number;
  path: Array<{ day: number; jitoSol: number; noMev: number }>;
  source: StakePoolStats["source"];
}

export function projectJitoSolYield(stats: StakePoolStats, amountSol: number, days: number): YieldProjection {
  const apy = stats.apy;
  const mevApy = mevApyEstimate(stats);
  const grow = (rate: number, d: number) => amountSol * Math.pow(1 + rate, d / 365);
  const steps = Math.min(60, Math.max(2, days));
  const path = Array.from({ length: steps + 1 }, (_, i) => {
    const d = (days * i) / steps;
    return { day: Math.round(d), jitoSol: grow(apy, d), noMev: grow(apy - mevApy, d) };
  });
  const jitoSolEnd = grow(apy, days);
  const nativeStakeEnd = grow(apy - mevApy, days);
  return {
    amountSol,
    days,
    apy,
    mevApy,
    jitoSolEnd,
    nativeStakeEnd,
    mevUpliftSol: jitoSolEnd - nativeStakeEnd,
    path,
    source: stats.source,
  };
}
