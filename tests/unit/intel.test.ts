import { describe, expect, it } from "vitest";
import { concentration, frontier, simulateScenario, valueFlow, type ValidatorRow } from "@/core/solana/intel";
import { clockFromAnchors, EPOCH_ANCHORS } from "@/core/solana/epochs";
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
    for (const p of frontier(rows, 340)) expect(p.stakerMevAprPct).toBeLessThanOrEqual(p.mevAprPct + 1e-12);
  });

  it("estimates MEV yield from network MEV over total Jito stake, not pool TVL", () => {
    const mev = mevApyEstimate(BUNDLED_STAKE_POOL);
    expect(mev).toBeGreaterThan(0);
    expect(mev).toBeLessThan(0.005);
  });

  it("orders scenario percentiles and reacts to an MEV shock", () => {
    const base = { amountSol: 100, days: 180, mevShock: 0, stakingShock: 0, stakingApr: 0.047, mevPerEpoch: [2e-5, 4e-5, 1e-5], daysPerEpoch: 1.08 };
    const r = simulateScenario(base);
    const end = r.fan[r.fan.length - 1];
    expect(end.p5).toBeLessThanOrEqual(end.p50);
    expect(end.p50).toBeLessThanOrEqual(end.p95);
    expect(end.p50).toBeGreaterThan(end.noMev);
    expect(simulateScenario({ ...base, mevShock: -1 }).endP50).toBeCloseTo(end.noMev, 6);
  });
});

describe("epoch length", () => {
  it("measures recent pace from block times, not an assumed two days", () => {
    const clock = clockFromAnchors(EPOCH_ANCHORS, "snapshot");
    expect(clock.daysPerEpoch).toBeGreaterThan(1);
    expect(clock.daysPerEpoch).toBeLessThan(1.2);
    expect(clock.epochsPerYear).toBeCloseTo(365.25 / clock.daysPerEpoch, 9);
  });

  it("ignores old epochs when slot times have since changed", () => {
    const day = 86_400_000;
    const anchors = [[0, 0], [100, 200 * day], [120, 220 * day]] as const;
    expect(clockFromAnchors(anchors, "live").daysPerEpoch).toBeCloseTo(1, 9);
  });

  it("annualises validator yield with the real number of epochs", () => {
    const row: ValidatorRow = { vote: "v", stakeSol: 1_000_000, mevCommissionBps: 0, mevRewardsSol: 10, bam: false, directedTarget: false, directedSol: 0 };
    expect(frontier([row], 340)[0].mevAprPct).toBeCloseTo(0.34, 9);
    expect(frontier([row], 170)[0].mevAprPct).toBeCloseTo(0.17, 9);
  });

  it("simulates the right number of epochs and the same staking yield at any pace", () => {
    const base = { amountSol: 100, days: 365, mevShock: -1, stakingShock: 0, stakingApr: 0.05, mevPerEpoch: [0] };
    const fast = simulateScenario({ ...base, daysPerEpoch: 1 });
    const slow = simulateScenario({ ...base, daysPerEpoch: 2 });
    expect(fast.fan).toHaveLength(366);
    expect(slow.fan).toHaveLength(184);
    expect(fast.fan[fast.fan.length - 1].day).toBe(365);
    expect(fast.endP50 / 100 - 1).toBeCloseTo(0.0513, 3);
    expect(slow.endP50 / 100 - 1).toBeCloseTo(0.0513, 3);
  });
});
