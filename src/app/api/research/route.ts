import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { runResearch } from "@/core/orchestrator/orchestrator";
import { DeterministicReasoner } from "@/core/llm/deterministic";

const BodySchema = z.object({
  question: z.string().min(4).max(2000),
  seed: z.number().int().min(0).max(2 ** 31).default(42),
  maxModels: z.number().int().min(1).max(3).optional(),
});

/**
 * Run a full deterministic research session server-side. This is the always-on
 * fallback for the public demo (§17); the browser can also run the identical
 * pipeline in a Web Worker, and — where WebGPU is available — drive planning
 * with a browser-local model. No paid API is involved on any path.
 */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request.", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const result = await runResearch({
      question: parsed.data.question,
      seed: parsed.data.seed,
      maxModels: parsed.data.maxModels,
      reasoner: new DeterministicReasoner(),
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Research run failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
