import { NextResponse, type NextRequest } from "next/server";
import { executeTool, PUBLIC_LIMITS } from "@/core/tools";
import { InMemoryAuditSink } from "@/core/audit/log";

/**
 * Execute one bounded, deterministic tool (§8, §16). The body is the tool
 * input; validation, execution limits and audit logging happen inside the
 * registry. A fresh audit sink is created per request (stateless).
 */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/tool/[name]">) {
  const { name } = await ctx.params;
  let input: unknown = {};
  try {
    input = await req.json();
  } catch {
    // Empty/invalid body is allowed; tools with defaults will still validate.
    input = {};
  }

  const audit = new InMemoryAuditSink();
  const result = await executeTool(name, input, {
    seed: 42,
    limits: PUBLIC_LIMITS,
    agentId: "orchestrator",
    audit,
  });

  return NextResponse.json(
    { ...result, audit: audit.entries() },
    { status: result.ok ? 200 : result.error?.code === "TOOL_NOT_FOUND" ? 404 : 400 },
  );
}
