import { NextResponse } from "next/server";
import { fetchStakePoolStats, fetchTipFloor } from "@/core/solana/live";

export const dynamic = "force-dynamic";

/**
 * Live Jito network snapshot for the Jito Lab: current tip floor and JitoSOL
 * stake-pool stats, each tagged `live` or `snapshot` (bundled fallback).
 * Proxied server-side so the browser never depends on third-party CORS.
 */
export async function GET() {
  const [tipFloor, stakePool] = await Promise.all([fetchTipFloor(), fetchStakePoolStats()]);
  return NextResponse.json({ tipFloor, stakePool });
}
