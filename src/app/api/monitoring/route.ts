import { NextResponse } from "next/server";
import { getMonitoringSnapshot } from "@/core/monitoring/metrics";

/** Demo monitoring metrics: drift, latency, errors and performance history (§16). */
export async function GET() {
  const snapshot = await getMonitoringSnapshot();
  return NextResponse.json(snapshot);
}
