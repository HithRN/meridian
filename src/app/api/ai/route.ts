import { NextResponse } from "next/server";
import { getLab } from "@/core/ai/lab";

export const runtime = "nodejs";
// Training is seeded and deterministic, so the report is computed once at build time.
export const dynamic = "force-static";

/**
 * The bundle-landing AI lab report: trained models (as JSON), test metrics,
 * training curves, Shapley importances, faithfulness to ground truth, partial
 * dependence and the explanation background. Built once per instance.
 */
export function GET() {
  return NextResponse.json(getLab());
}
