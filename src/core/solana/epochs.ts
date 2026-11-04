/**
 * How long Solana epochs really are. An epoch is a fixed 432,000 slots, but not a
 * fixed length of time: slot times have shortened, so a two-day epoch became
 * roughly a one-day epoch during 2026. Anything that annualises a per-epoch figure
 * or dates an epoch must measure this from block times rather than assume it.
 */

const SOLANA_RPC = "https://api.mainnet-beta.solana.com";
const SLOTS_PER_EPOCH = 432_000;
const PACE_WINDOW_EPOCHS = 20;
const CACHE_MS = 6 * 3_600_000;
const DAY_MS = 86_400_000;

type Anchor = readonly [epoch: number, startMs: number];

/** Boundaries measured from block times, used only if the Solana RPC is unreachable. */
export const EPOCH_ANCHORS: readonly Anchor[] = [
  [1047, Date.UTC(2026, 9, 1, 13, 40, 58)],
  [1052, Date.UTC(2026, 9, 8, 6, 28, 1)],
  [1057, Date.UTC(2026, 9, 13, 23, 31, 30)],
  [1062, Date.UTC(2026, 9, 19, 9, 30, 15)],
  [1067, Date.UTC(2026, 9, 24, 17, 59, 46)],
  [1072, Date.UTC(2026, 9, 30, 1, 43, 49)],
  [1077, Date.UTC(2026, 10, 4, 10, 12, 45)],
];

/** Piecewise-linear epoch dating; beyond the anchors, the nearest segment's pace continues. */
export function epochStartFromAnchors(anchors: readonly Anchor[], epoch: number): number {
  const sorted = [...anchors].sort((a, b) => a[0] - b[0]);
  let i = 0;
  while (i < sorted.length - 2 && epoch > sorted[i + 1][0]) i++;
  const [e0, t0] = sorted[i];
  const [e1, t1] = sorted[i + 1];
  return t0 + ((epoch - e0) * (t1 - t0)) / (e1 - e0);
}

async function rpc<T>(method: string, params: unknown[] = []): Promise<T | null> {
  const res = await fetch(SOLANA_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(6_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Solana RPC HTTP ${res.status}`);
  return ((await res.json()) as { result?: T }).result ?? null;
}

/** Start times of epochs from the current one back to `oldest`, read from block times. */
export async function liveEpochAnchors(oldest: number | null, step = 5): Promise<Anchor[]> {
  const info = await rpc<{ absoluteSlot: number; slotIndex: number; epoch: number }>("getEpochInfo");
  if (!info) throw new Error("No epoch info");
  const start = info.absoluteSlot - info.slotIndex;
  const last = oldest ?? info.epoch - PACE_WINDOW_EPOCHS;
  const anchors: Anchor[] = [];
  for (let e = info.epoch; ; e -= step) {
    const slot = start - (info.epoch - e) * SLOTS_PER_EPOCH;
    let time: number | null = null;
    // A slot may have been skipped by its leader, so try the next few.
    for (let offset = 0; offset < 5 && time === null; offset++) {
      try {
        time = await rpc<number>("getBlockTime", [slot + offset]);
      } catch {
        time = null;
      }
    }
    if (time === null) throw new Error("No block time");
    anchors.push([e, time * 1000]);
    if (e <= last) return anchors;
  }
}

/** A staker's yearly MEV yield from each finished epoch's reward per staked lamport. */
export function annualisedStakerMev(rewardPerLamport: readonly number[], commission: number, epochsPerYear: number): number {
  if (!rewardPerLamport.length) return 0;
  const mean = rewardPerLamport.reduce((s, v) => s + v, 0) / rewardPerLamport.length;
  return mean * (1 - commission) * epochsPerYear;
}

export interface EpochClock {
  daysPerEpoch: number;
  epochsPerYear: number;
  source: "live" | "snapshot";
}

/** Recent pace, averaged over about 20 epochs so one unusual epoch cannot distort it. */
export function clockFromAnchors(anchors: readonly Anchor[], source: EpochClock["source"]): EpochClock {
  const sorted = [...anchors].sort((a, b) => b[0] - a[0]);
  const newest = sorted[0];
  const older = sorted.find((a) => newest[0] - a[0] >= PACE_WINDOW_EPOCHS) ?? sorted[sorted.length - 1];
  const daysPerEpoch = (newest[1] - older[1]) / (newest[0] - older[0]) / DAY_MS;
  return { daysPerEpoch, epochsPerYear: 365.25 / daysPerEpoch, source };
}

let cached: { clock: EpochClock; at: number } | null = null;

export async function fetchEpochClock(now = Date.now()): Promise<EpochClock> {
  if (cached && now - cached.at < CACHE_MS) return cached.clock;
  let clock: EpochClock;
  try {
    clock = clockFromAnchors(await liveEpochAnchors(null, PACE_WINDOW_EPOCHS), "live");
    cached = { clock, at: now };
  } catch {
    // Not cached, so the next request tries the live source again.
    clock = clockFromAnchors(EPOCH_ANCHORS, "snapshot");
  }
  return clock;
}
