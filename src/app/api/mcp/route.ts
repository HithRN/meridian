import { NextResponse, type NextRequest } from "next/server";
import { RPC, SUPPORTED_PROTOCOL_VERSIONS, handleMcp, parseMessage } from "@/core/mcp/server";
import { clientKey, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * MCP endpoint — Streamable HTTP transport, stateless, JSON responses.
 * POST one JSON-RPC message; GET (server-initiated stream) is not offered.
 */
export async function POST(req: NextRequest) {
  const limit = rateLimit(clientKey(req, "mcp"), 120, 60_000);
  if (!limit.ok) {
    return rpcError(RPC.INTERNAL_ERROR, "Rate limit exceeded", 429, { "Retry-After": String(limit.retryAfterS) });
  }
  if (!originAllowed(req)) return rpcError(RPC.INVALID_REQUEST, "Origin not allowed", 403);

  const version = req.headers.get("mcp-protocol-version");
  if (version && !(SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(version)) {
    return rpcError(RPC.INVALID_REQUEST, `Unsupported MCP-Protocol-Version: ${version}`, 400);
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return rpcError(RPC.PARSE_ERROR, "Parse error", 400);
  }
  // A JSON-RPC response from the client (we never send requests) is simply acknowledged.
  const r = raw as Record<string, unknown> | null;
  if (r && !Array.isArray(r) && r.jsonrpc === "2.0" && !("method" in r) && ("result" in r || "error" in r)) {
    return new NextResponse(null, { status: 202 });
  }
  const msg = parseMessage(raw);
  if (!("method" in msg)) return NextResponse.json(msg, { status: 400 });

  try {
    const res = await handleMcp(msg);
    if (res === null) return new NextResponse(null, { status: 202 });
    return NextResponse.json(res, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({
      jsonrpc: "2.0",
      id: msg.id ?? null,
      error: { code: RPC.INTERNAL_ERROR, message: err instanceof Error ? err.message : "Internal error" },
    });
  }
}

export function GET() {
  return new NextResponse("This MCP server does not offer a server-initiated SSE stream. POST JSON-RPC messages instead.", {
    status: 405,
    headers: { Allow: "POST" },
  });
}

export function DELETE() {
  return new NextResponse(null, { status: 405, headers: { Allow: "POST" } });
}

function rpcError(code: number, message: string, status: number, headers?: Record<string, string>) {
  return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code, message } }, { status, headers });
}

/**
 * DNS-rebinding guard: browsers send Origin; allow same-origin, localhost
 * tooling (e.g. MCP Inspector) and any origins listed in MCP_ALLOWED_ORIGINS.
 * Non-browser clients send no Origin and are allowed.
 */
function originAllowed(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    const o = new URL(origin);
    if (o.host === req.nextUrl.host) return true;
    if (o.hostname === "localhost" || o.hostname === "127.0.0.1") return true;
  } catch {
    return false;
  }
  const extra = (process.env.MCP_ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return extra.includes(origin);
}
