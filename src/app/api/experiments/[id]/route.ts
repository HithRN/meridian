import { NextResponse } from "next/server";
import { getServerStore, getSeedResultById } from "@/core/experiments/seed";

/** Retrieve a single experiment's full record, plus trace when it is a seed run. */
export async function GET(_req: Request, ctx: RouteContext<"/api/experiments/[id]">) {
  const { id } = await ctx.params;
  const store = await getServerStore();
  const record = store.get(id);
  if (!record) {
    return NextResponse.json({ error: `Experiment not found: ${id}` }, { status: 404 });
  }
  const seed = await getSeedResultById(id);
  return NextResponse.json({
    record,
    trace: seed?.trace ?? [],
    audit: seed?.audit ?? [],
    equityCurves: seed?.equityCurves ?? {},
    reportMarkdown: seed?.reportMarkdown ?? null,
  });
}
