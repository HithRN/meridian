import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { claudeConfigured, runClaudeCopilot } from "@/core/copilot/claude";
import { runDeterministicCopilot } from "@/core/copilot/deterministic";
import { clientKey, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

const BodySchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(4000) }))
    .min(1)
    .max(30)
    .refine((m) => m[m.length - 1].role === "user", "Last message must be from the user."),
  engine: z.enum(["auto", "deterministic"]).default("auto"),
});

/** Which engine will answer — lets the UI show the badge before the first message. */
export function GET() {
  return NextResponse.json({ claude: claudeConfigured() });
}

/**
 * Conversational copilot over the audited tool surface. Uses Claude when the
 * server has Anthropic credentials, and the deterministic router otherwise or
 * on any Claude failure — a question always gets an evidence-backed answer.
 */
export async function POST(req: NextRequest) {
  const limit = rateLimit(clientKey(req, "copilot"), 20, 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many requests — please wait a moment." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterS) } },
    );
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request.", issues: parsed.error.issues }, { status: 400 });
  }
  const { messages, engine } = parsed.data;

  if (engine === "auto" && claudeConfigured()) {
    try {
      return NextResponse.json(await runClaudeCopilot(messages));
    } catch (err) {
      const reason =
        err instanceof Anthropic.AuthenticationError
          ? "Anthropic credentials were rejected"
          : err instanceof Anthropic.RateLimitError
            ? "Claude is rate-limited"
            : err instanceof Anthropic.APIError
              ? `Claude API error ${err.status ?? ""}`.trim()
              : "Claude was unreachable";
      const fallback = await runDeterministicCopilot(messages);
      return NextResponse.json({ ...fallback, notice: `${reason} — answered by the deterministic engine.` });
    }
  }
  return NextResponse.json(await runDeterministicCopilot(messages));
}
