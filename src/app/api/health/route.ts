import { NextResponse } from "next/server";
import { versionManifest } from "@/core/version";
import { listTools } from "@/core/tools";

/** Deployment health probe (§16). */
export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "meridian",
    time: new Date().toISOString(),
    versions: versionManifest(),
    tools: listTools().length,
  });
}
