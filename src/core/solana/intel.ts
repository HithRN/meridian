/**
 * Jito market intelligence: validator economics, stake concentration, MEV
 * value flow and epoch history, built from Jito's public mainnet APIs.
 *
 *   GET  /api/v1/validators              current-epoch validator set
 *   POST /api/v1/validators  {epoch}     per-validator MEV for a completed epoch
 *   GET  /api/v1/mev_rewards             latest epoch's network MEV
 *   POST /api/v1/mev_rewards {epoch}     network MEV for a given epoch
 *
 * Completed epochs never change, so they are cached for the life of the
 * instance. Bundled snapshots (epoch 1074 validators, epochs 1051-1075) keep
 * the page working offline, and every payload reports which source it used.
 */

import validatorSnapshot from "@/core/solana/snapshots/validators.json";
import epochSnapshot from "@/core/solana/snapshots/epochs.json";

const KOBE = "https://kobe.mainnet.jito.network/api/v1";
const TIMEOUT_MS = 6_000;

export interface ValidatorRow {
  vote: string;
  stakeSol: number;
  mevCommissionBps: number;
  mevRewardsSol: number;
  bam: boolean;
  directedTarget: boolean;
  directedSol: number;
}

export interface EpochMev {
  epoch: number;
  totalMevSol: number;
  jitoStakeSol: number;
  rewardPerLamport: number;
}

type Source = "live" | "snapshot";

async function kobe(path: string, body?: unknown): Promise<unknown> {
  const res = await fetch(`${KOBE}${path}`, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const epochCache = new Map<number, EpochMev>();

function parseEpoch(raw: unknown): EpochMev | null {
  const r = raw as { epoch?: number; total_network_mev_lamports?: number; jito_stake_weight_lamports?: number; mev_reward_per_lamport?: number };
  if (typeof r?.epoch !== "number" || typeof r.total_network_mev_lamports !== "number" || !r.jito_stake_weight_lamports) return null;
  return {
    epoch: r.epoch,
    totalMevSol: r.total_network_mev_lamports / 1e9,
    jitoStakeSol: r.jito_stake_weight_lamports / 1e9,
    rewardPerLamport: r.mev_reward_per_lamport ?? 0,
  };
}

/** The last `count` epochs of network MEV, newest last. The newest may be in progress. */
export async function fetchEpochHistory(count = 20): Promise<{ data: EpochMev[]; source: Source; currentEpoch: number }> {
  try {
    const latest = parseEpoch(await kobe("/mev_rewards"));
    if (!latest) throw new Error("bad shape");
    const wanted = Array.from({ length: count - 1 }, (_, i) => latest.epoch - (count - 1) + i);
    const done = await Promise.all(
      wanted.map(async (e) => {
        const hit = epochCache.get(e);
        if (hit) return hit;
        try {
          const r = parseEpoch(await kobe("/mev_rewards", { epoch: e }));
          if (r && r.totalMevSol > 0) epochCache.set(e, r);
          return r;
        } catch {
          return (epochSnapshot as EpochMev[]).find((s) => s.epoch === e) ?? null;
        }
      }),
    );
    return { data: [...done.filter((x): x is EpochMev => x !== null), latest], source: "live", currentEpoch: latest.epoch };
  } catch {
    const data = epochSnapshot as EpochMev[];
    return { data: data.slice(-count), source: "snapshot", currentEpoch: data[data.length - 1].epoch };
  }
}

let validatorCache: { epoch: number; rows: ValidatorRow[]; at: number } | null = null;

function snapshotValidators(): { epoch: number; rows: ValidatorRow[] } {
  const s = validatorSnapshot as unknown as { epoch: number; rows: Array<Array<string | number | null>> };
  return {
    epoch: s.epoch,
    rows: s.rows.map(([vote, stakeSol, mevCommissionBps, mevRewardsSol, bam, directedTarget, directedSol]) => ({
      vote: String(vote),
      stakeSol: Number(stakeSol) || 0,
      mevCommissionBps: Number(mevCommissionBps) || 0,
      mevRewardsSol: Number(mevRewardsSol) || 0,
      bam: bam === 1,
      directedTarget: directedTarget === 1,
      directedSol: Number(directedSol) || 0,
    })),
  };
}

/** Per-validator data for the most recent completed epoch. */
export async function fetchValidators(completedEpoch: number): Promise<{ epoch: number; rows: ValidatorRow[]; source: Source }> {
  if (validatorCache && validatorCache.epoch === completedEpoch && Date.now() - validatorCache.at < 30 * 60_000) {
    return { epoch: validatorCache.epoch, rows: validatorCache.rows, source: "live" };
  }
  try {
    const raw = (await kobe("/validators", { epoch: completedEpoch })) as { validators?: Array<Record<string, unknown>> };
    const list = raw.validators ?? [];
    if (!list.length) throw new Error("empty");
    const rows: ValidatorRow[] = list.map((v) => ({
      vote: String(v.vote_account),
      stakeSol: Number(v.active_stake) / 1e9,
      mevCommissionBps: Number(v.mev_commission_bps ?? 0),
      mevRewardsSol: Number(v.mev_rewards ?? 0) / 1e9,
      bam: Boolean(v.running_bam),
      directedTarget: Boolean(v.jito_directed_stake_target),
      directedSol: Number(v.jito_directed_stake_lamports ?? 0) / 1e9,
    }));
    if (rows.reduce((s, r) => s + r.mevRewardsSol, 0) <= 0) throw new Error("no rewards yet");
    validatorCache = { epoch: completedEpoch, rows, at: Date.now() };
    return { epoch: completedEpoch, rows, source: "live" };
  } catch {
    return { ...snapshotValidators(), source: "snapshot" };
  }
}

/* -------------------------------------------------------------- analytics */

export interface Concentration {
  validators: number;
  totalStakeSol: number;
  /** Lorenz curve: cumulative share of validators vs cumulative share of stake. */
  lorenz: Array<{ x: number; y: number }>;
  gini: number;
  /** Herfindahl-Hirschman index on stake shares, 0-10,000. */
  hhi: number;
  top: Array<{ n: number; share: number }>;
  /** Fewest validators that together hold more than one third of stake. */
  nakamoto: number;
}

export function concentration(rows: ValidatorRow[]): Concentration {
  const stakes = rows.map((r) => r.stakeSol).filter((s) => s > 0).sort((a, b) => a - b);
  const total = stakes.reduce((a, b) => a + b, 0);
  const n = stakes.length;
  let cum = 0;
  let area = 0;
  const lorenz: Array<{ x: number; y: number }> = [{ x: 0, y: 0 }];
  const step = Math.max(1, Math.floor(n / 120));
  stakes.forEach((s, i) => {
    const prev = cum;
    cum += s;
    area += (prev + cum) / 2 / total / n;
    if ((i + 1) % step === 0 || i === n - 1) lorenz.push({ x: (i + 1) / n, y: cum / total });
  });
  const desc = [...stakes].reverse();
  const shareOf = (k: number) => desc.slice(0, k).reduce((a, b) => a + b, 0) / total;
  let nakamoto = 0;
  for (let acc = 0; nakamoto < n && acc <= total / 3; nakamoto++) acc += desc[nakamoto];
  return {
    validators: n,
    totalStakeSol: total,
    lorenz,
    gini: 1 - 2 * area,
    hhi: desc.reduce((h, s) => h + (s / total) ** 2, 0) * 10_000,
    top: [5, 10, 20, 50].map((k) => ({ n: k, share: shareOf(k) })),
    nakamoto,
  };
}

export interface FrontierPoint {
  vote: string;
  commissionPct: number;
  /** Annualised gross MEV earned per SOL staked, in percent. */
  mevAprPct: number;
  /** What a delegator keeps after commission, annualised, in percent. */
  stakerMevAprPct: number;
  stakeSol: number;
  group: "BAM" | "Jito-Solana";
  directedTarget: boolean;
}

export function frontier(rows: ValidatorRow[], epochsPerYear: number): FrontierPoint[] {
  return rows
    .filter((r) => r.stakeSol > 1_000)
    .map((r) => {
      const apr = (r.mevRewardsSol / r.stakeSol) * epochsPerYear * 100;
      return {
        vote: r.vote,
        commissionPct: r.mevCommissionBps / 100,
        mevAprPct: apr,
        stakerMevAprPct: apr * (1 - r.mevCommissionBps / 10_000),
        stakeSol: r.stakeSol,
        group: r.bam ? ("BAM" as const) : ("Jito-Solana" as const),
        directedTarget: r.directedTarget,
      };
    });
}

export interface ValueFlow {
  epoch: number;
  totalMevSol: number;
  validatorCommissionSol: number;
  stakersSol: number;
  jitoSolSol: number;
  otherStakersSol: number;
  stakeWeightedCommission: number;
  bamStakeShare: number;
  directedStakeSol: number;
}

/**
 * Where one epoch's MEV went: kept by validators as commission, or passed to
 * stakers; the JitoSOL share of the staker portion is estimated from the pool's
 * share of Jito stake.
 */
export function valueFlow(epoch: number, rows: ValidatorRow[], jitoSolTvlSol: number): ValueFlow {
  const total = rows.reduce((s, r) => s + r.mevRewardsSol, 0);
  const kept = rows.reduce((s, r) => s + r.mevRewardsSol * (r.mevCommissionBps / 10_000), 0);
  const stake = rows.reduce((s, r) => s + r.stakeSol, 0);
  const stakers = total - kept;
  const jitoShare = stake > 0 ? Math.min(1, jitoSolTvlSol / stake) : 0;
  return {
    epoch,
    totalMevSol: total,
    validatorCommissionSol: kept,
    stakersSol: stakers,
    jitoSolSol: stakers * jitoShare,
    otherStakersSol: stakers * (1 - jitoShare),
    stakeWeightedCommission: stake > 0 ? rows.reduce((s, r) => s + r.stakeSol * r.mevCommissionBps, 0) / stake / 10_000 : 0,
    bamStakeShare: stake > 0 ? rows.filter((r) => r.bam).reduce((s, r) => s + r.stakeSol, 0) / stake : 0,
    directedStakeSol: rows.reduce((s, r) => s + r.directedSol, 0),
  };
}

/* ---------------------------------------------------------------- scenarios */

export interface ScenarioInput {
  amountSol: number;
  days: number;
  /** Change in MEV activity, e.g. -0.4 for a 40% fall. */
  mevShock: number;
  /** Change in base staking yield, e.g. -0.1 for a 10% lower staking APR. */
  stakingShock: number;
  stakingApr: number;
  /** Observed staker MEV yield per epoch (after commission), one value per epoch. */
  mevPerEpoch: number[];
  /** Measured epoch length; see core/solana/epochs. */
  daysPerEpoch: number;
  paths?: number;
  seed?: number;
}

export interface ScenarioResult {
  fan: Array<{ day: number; p5: number; p25: number; p50: number; p75: number; p95: number; noMev: number }>;
  endP5: number;
  endP50: number;
  endP95: number;
}

/** Bootstrap Monte Carlo: resample observed epoch MEV yields, scaled by the shock. */
export function simulateScenario(s: ScenarioInput): ScenarioResult {
  const paths = s.paths ?? 400;
  const epochs = Math.max(1, Math.round(s.days / s.daysPerEpoch));
  let seed = s.seed ?? 7;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  const staking = (s.stakingApr * (1 + s.stakingShock)) * (s.daysPerEpoch / 365.25);
  const pool = s.mevPerEpoch.length ? s.mevPerEpoch : [0];
  const values: number[][] = Array.from({ length: epochs + 1 }, () => []);
  for (let p = 0; p < paths; p++) {
    let v = s.amountSol;
    values[0].push(v);
    for (let e = 1; e <= epochs; e++) {
      const mev = pool[Math.floor(rand() * pool.length)] * Math.max(0, 1 + s.mevShock);
      v *= 1 + staking + mev;
      values[e].push(v);
    }
  }
  const q = (arr: number[], k: number) => {
    const sorted = [...arr].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor(k * sorted.length))];
  };
  const fan = values.map((vals, e) => ({
    day: Math.round(e * s.daysPerEpoch),
    p5: q(vals, 0.05),
    p25: q(vals, 0.25),
    p50: q(vals, 0.5),
    p75: q(vals, 0.75),
    p95: q(vals, 0.95),
    noMev: s.amountSol * Math.pow(1 + staking, e),
  }));
  const last = fan[fan.length - 1];
  return { fan, endP5: last.p5, endP50: last.p50, endP95: last.p95 };
}
