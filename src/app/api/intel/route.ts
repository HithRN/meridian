import { NextResponse } from "next/server";
import { concentration, fetchEpochHistory, fetchValidators, frontier, valueFlow } from "@/core/solana/intel";
import { fetchEpochClock } from "@/core/solana/epochs";
import { fetchStakePoolStats } from "@/core/solana/live";
import { mevApyEstimate } from "@/core/solana/staking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Jito market intelligence: epoch MEV history, the validator set for the last
 * completed epoch, stake concentration, the MEV value flow and the inputs for
 * the JitoSOL scenario simulator. Each part reports live or snapshot.
 */
export async function GET() {
  const [epochs, pool, clock] = await Promise.all([fetchEpochHistory(20), fetchStakePoolStats(), fetchEpochClock()]);
  const completed = epochs.data.filter((e) => e.epoch < epochs.currentEpoch);
  const lastCompleted = completed.length ? completed[completed.length - 1].epoch : epochs.currentEpoch - 1;
  const validators = await fetchValidators(lastCompleted);
  const flow = valueFlow(validators.epoch, validators.rows, pool.data.tvlSol);
  const stakerMevPerEpoch = completed.map((e) => e.rewardPerLamport * (1 - flow.stakeWeightedCommission));
  const mevApr = mevApyEstimate(pool.data);

  return NextResponse.json({
    generatedAt: Date.now(),
    epochs: { ...epochs, completedEpoch: lastCompleted },
    validators: {
      epoch: validators.epoch,
      source: validators.source,
      count: validators.rows.length,
      bamCount: validators.rows.filter((r) => r.bam).length,
      directedTargets: validators.rows.filter((r) => r.directedTarget).length,
    },
    concentration: concentration(validators.rows),
    frontier: frontier(validators.rows, clock.epochsPerYear),
    epochClock: clock,
    flow,
    pool: { apy: pool.data.apy, tvlSol: pool.data.tvlSol, source: pool.source, mevApr, stakingApr: Math.max(0, pool.data.apy - mevApr) },
    stakerMevPerEpoch,
  });
}
