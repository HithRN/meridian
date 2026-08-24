import { NextResponse } from "next/server";
import { getToolManifest } from "@/core/tools";

/**
 * MCP-compatible tool discovery (§8, §16). Returns stable tool names, titles,
 * permission classes and JSON Schemas for inputs and outputs.
 */
export async function GET() {
  const tools = getToolManifest();
  return NextResponse.json({
    protocol: "meridian-mcp/1.0",
    count: tools.length,
    tools,
  });
}
