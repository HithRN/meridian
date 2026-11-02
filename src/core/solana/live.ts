/**
 * Read-only access to Jito's public mainnet APIs.
 *
 * Both endpoints are free, keyless and rate-limited, so responses are cached for
 * a minute and every call has a short timeout. Any failure — offline, blocked,
 * malformed — degrades to bundled data and says so via `source`, so the demo
 * never breaks in front of an audience.
 */

import { BUNDLED_STAKE_POOL, parseStakePoolStats, type StakePoolStats } from "@/core/solana/staking";
import type { TipFloorSnapshot } from "@/core/solana/tips";

export const JITO_TIP_FLOOR_URL = "https://bundles.jito.wtf/api/v1/bundles/tip_floor";
export const JITO_STAKE_POOL_URL = "https://kobe.mainnet.jito.network/api/v1/stake_pool_stats";

const TTL_MS = 60_000;
const TIMEOUT_MS = 4_000;

/** Captured from the tip-floor API on 2026-11-02; used when offline. */
export const BUNDLED_TIP_FLOOR: TipFloorSnapshot = {
  time: "2026-11-02T16:30:37+00:00",
  p25: 4.888e-6,
  p50: 1e-5,
  p75: 5.03675e-5,
  p95: 3.958977e-4,
  p99: 5.0721698e-3,
  emaP50: 9.69668906e-6,
};

export interface Sourced<T> {
  data: T;
  source: "live" | "snapshot";
  fetchedAt: number;
  error?: string;
}

const cache = new Map<string, Sourced<unknown>>();

async function cachedFetch<T>(
  key: string,
  load: () => Promise<T | null>,
  fallback: T,
): Promise<Sourced<T>> {
  const hit = cache.get(key) as Sourced<T> | undefined;
  if (hit && hit.source === "live" && Date.now() - hit.fetchedAt < TTL_MS) return hit;
  try {
    const data = await load();
    if (data === null) throw new Error("Unexpected response shape");
    const fresh: Sourced<T> = { data, source: "live", fetchedAt: Date.now() };
    cache.set(key, fresh);
    return fresh;
  } catch (err) {
    return {
      data: fallback,
      source: "snapshot",
      fetchedAt: Date.now(),
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export function parseTipFloor(raw: unknown): TipFloorSnapshot | null {
  const row = (Array.isArray(raw) ? raw[0] : null) as Record<string, number | string> | null;
  if (!row || typeof row.landed_tips_50th_percentile !== "number") return null;
  return {
    time: String(row.time),
    p25: Number(row.landed_tips_25th_percentile),
    p50: Number(row.landed_tips_50th_percentile),
    p75: Number(row.landed_tips_75th_percentile),
    p95: Number(row.landed_tips_95th_percentile),
    p99: Number(row.landed_tips_99th_percentile),
    emaP50: Number(row.ema_landed_tips_50th_percentile),
  };
}

export function fetchTipFloor(): Promise<Sourced<TipFloorSnapshot>> {
  return cachedFetch("tip_floor", async () => parseTipFloor(await getJson(JITO_TIP_FLOOR_URL)), BUNDLED_TIP_FLOOR);
}

export function fetchStakePoolStats(): Promise<Sourced<StakePoolStats>> {
  return cachedFetch(
    "stake_pool",
    async () => parseStakePoolStats(await getJson(JITO_STAKE_POOL_URL)),
    BUNDLED_STAKE_POOL,
  );
}
