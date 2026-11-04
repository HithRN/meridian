/**
 * The one measure of MEV yield every page shows: Jito's reward per staked lamport
 * in each finished epoch, after validator commission, annualised with the measured
 * number of epochs a year. Server only, since it reads the validator set.
 */

import { annualisedStakerMev, fetchEpochClock } from "@/core/solana/epochs";
import { fetchEpochHistory, fetchValidators, valueFlow } from "@/core/solana/intel";

const CACHE_MS = 30 * 60_000;
const BUDGET_MS = 8_000;
const EPOCHS = 20;

let cached: { value: number; at: number } | null = null;

async function measure(): Promise<number> {
  const [history, clock] = await Promise.all([fetchEpochHistory(EPOCHS), fetchEpochClock()]);
  const done = history.data.filter((e) => e.epoch < history.currentEpoch);
  if (!done.length) throw new Error("No finished epochs");
  const validators = await fetchValidators(done[done.length - 1].epoch);
  const { stakeWeightedCommission } = valueFlow(validators.epoch, validators.rows, 0);
  return annualisedStakerMev(done.map((e) => e.rewardPerLamport), stakeWeightedCommission, clock.epochsPerYear);
}

/**
 * The live figure, or null if it cannot be measured in time. A page render never
 * waits long for this; it falls back to the last good value.
 */
export async function fetchMeasuredMevApy(now = Date.now()): Promise<number | null> {
  if (cached && now - cached.at < CACHE_MS) return cached.value;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const value = await Promise.race([
      measure(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Timed out")), BUDGET_MS);
      }),
    ]);
    cached = { value, at: now };
    return value;
  } catch {
    return cached?.value ?? null;
  } finally {
    clearTimeout(timer);
  }
}
