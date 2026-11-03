import { describe, expect, it } from "vitest";
import { handleMcp, mcpTools, parseMessage, LATEST_PROTOCOL_VERSION } from "@/core/mcp/server";

describe("MCP server", () => {
  it("negotiates the protocol version on initialize", async () => {
    const res = (await handleMcp({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } } })) as { result: { protocolVersion: string; capabilities: { tools: object } } };
    expect(res.result.protocolVersion).toBe("2025-06-18");
    expect(res.result.capabilities.tools).toBeTruthy();
    const unknown = (await handleMcp({ jsonrpc: "2.0", id: 2, method: "initialize", params: { protocolVersion: "1999-01-01" } })) as { result: { protocolVersion: string } };
    expect(unknown.result.protocolVersion).toBe(LATEST_PROTOCOL_VERSION);
  });

  it("lists read-only tools with object input schemas", async () => {
    const tools = mcpTools();
    expect(tools.length).toBeGreaterThanOrEqual(18);
    for (const t of tools) {
      expect(t.inputSchema.type).toBe("object");
      expect("$schema" in t.inputSchema).toBe(false);
      expect(t.annotations.readOnlyHint).toBe(true);
    }
  });

  it("calls a tool and returns structured content", async () => {
    const res = (await handleMcp({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "list_datasets", arguments: {} } })) as { result: { isError: boolean; structuredContent: { datasets: unknown[] }; content: Array<{ type: string }> } };
    expect(res.result.isError).toBe(false);
    expect(res.result.structuredContent.datasets.length).toBeGreaterThan(0);
    expect(res.result.content[0].type).toBe("text");
  });

  it("reports tool input errors as isError results, unknown tools as JSON-RPC errors", async () => {
    const bad = (await handleMcp({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "list_datasets", arguments: { bogus: 1 } } })) as { result: { isError: boolean } };
    expect(bad.result.isError).toBe(true);
    const missing = (await handleMcp({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "nope" } })) as { error: { code: number } };
    expect(missing.error.code).toBe(-32602);
  });

  it("ignores notifications and rejects batches and unknown methods", async () => {
    expect(await handleMcp({ jsonrpc: "2.0", method: "notifications/initialized" })).toBeNull();
    expect("error" in (parseMessage([]) as object)).toBe(true);
    const r = (await handleMcp({ jsonrpc: "2.0", id: 6, method: "resources/list" })) as { error: { code: number } };
    expect(r.error.code).toBe(-32601);
  });
});
