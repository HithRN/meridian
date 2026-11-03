import { describe, expect, it } from "vitest";
import { concentration, frontier, simulateScenario, valueFlow, type ValidatorRow } from "@/core/solana/intel";
import { BUNDLED_STAKE_POOL, mevApyEstimate } from "@/core/solana/staking";
import snapshot from "@/core/solana/snapshots/validators.json";

const rows: ValidatorRow[] = (snapshot as unknown as { rows: Array<Array<string | number | null>> }).rows.map(
  ([vote, stakeSol, c, m, bam, t, d]) => ({
    vote: String(vote),
    stakeSol: Number(stakeSol) || 0,
    mevCommissionBps: Number(c) || 0,
    mevRewardsSol: Number(m) || 0,
    bam: bam === 1,
    directedTarget: t === 1,
    directedSol: Number(d) || 0,
  }),
);

describe("Jito market intelligence", () => {
  it("computes coherent stake-concentration metrics", () => {
    const c = concentration(rows);
    expect(c.validators).toBeGreaterThan(500);
    expect(c.gini).toBeGreaterThan(0);
    expect(c.gini).toBeLessThan(1);
    expect(c.hhi).toBeGreaterThan(0);
    expect(c.nakamoto).toBeGreaterThan(5);
    expect(c.top[1].share).toBeGreaterThan(c.top[0].share);
    expect(c.lorenz[c.lorenz.length - 1].y).toBeCloseTo(1, 6);
  });

  it("conserves MEV through the value flow", () => {
    const f = valueFlow(1074, rows, 10_000_000);
    expect(f.validatorCommissionSol + f.stakersSol).toBeCloseTo(f.totalMevSol, 6);
    expect(f.jitoSolSol + f.otherStakersSol).toBeCloseTo(f.stakersSol, 6);
    expect(f.stakeWeightedCommission).toBeGreaterThan(0);
  });

  it("builds frontier points with staker yield at or below gross yield", () => {
    for (const p of frontier(rows)) expect(p.stakerMevAprPct).toBeLessThanOrEqual(p.mevAprPct + 1e-12);
  });

  it("estimates MEV yield from network MEV over total Jito stake, not pool TVL", () => {
    const mev = mevApyEstimate(BUNDLED_STAKE_POOL);
    expect(mev).toBeGreaterThan(0);
    expect(mev).toBeLessThan(0.005);
  });

  it("orders scenario percentiles and reacts to an MEV shock", () => {
    const base = { amountSol: 100, days: 180, mevShock: 0, stakingShock: 0, stakingApr: 0.047, mevPerEpoch: [2e-5, 4e-5, 1e-5] };
    const r = simulateScenario(base);
    const end = r.fan[r.fan.length - 1];
    expect(end.p5).toBeLessThanOrEqual(end.p50);
    expect(end.p50).toBeLessThanOrEqual(end.p95);
    expect(end.p50).toBeGreaterThan(end.noMev);
    expect(simulateScenario({ ...base, mevShock: -1 }).endP50).toBeCloseTo(end.noMev, 6);
  });
});
