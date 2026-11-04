import type { NextRequest } from "next/server";
import { z } from "zod";
import { ResearchInputError, runMarketResearch } from "@/core/market/research/run";
import { ANALYSIS_KINDS, type ResearchEvent } from "@/core/market/research/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BodySchema = z.object({
  question: z.string().trim().min(4).max(600),
  overrides: z
    .object({
      assets: z.array(z.string().min(1).max(20)).max(5).optional(),
      days: z.number().min(1).max(730).optional(),
      analyses: z.array(z.enum(ANALYSIS_KINDS)).min(1).optional(),
    })
    .optional(),
});

/**
 * Research a question against the live market. Responds with one JSON event per
 * line, so the page can show each step as it really happens.
 */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Please ask a question of at least a few words." }, { status: 400 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: ResearchEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        const report = await runMarketResearch({ ...parsed.data, onStep: (step) => send({ type: "step", step }) });
        send({ type: "report", report });
      } catch (err) {
        const message = err instanceof ResearchInputError ? err.message : "The live market data could not be reached. Please try again in a moment.";
        if (!(err instanceof ResearchInputError)) console.error("market research failed", err);
        send({ type: "error", message });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" } });
}
