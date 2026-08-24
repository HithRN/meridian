import { NextResponse, type NextRequest } from "next/server";
import { getServerStore } from "@/core/experiments/seed";
import { ExperimentRecordSchema } from "@/core/schemas/experiment";

/** List lightweight experiment records (§16). */
export async function GET() {
  const store = await getServerStore();
  return NextResponse.json({ experiments: store.list() });
}

/**
 * Create/register an experiment record. The demo store is ephemeral per warm
 * serverless instance (§5); the client persists its own runs in the browser.
 */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const parsed = ExperimentRecordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Record failed schema validation.", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const store = await getServerStore();
  const saved = store.put(parsed.data);
  return NextResponse.json({ experimentId: saved.id, record: saved }, { status: 201 });
}
