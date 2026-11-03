import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader, PageBody, Section } from "@/components/layout/PageHeader";
import { KeyValue } from "@/components/ui/primitives";
import { EndpointSnippets, McpPlayground } from "@/components/developer/McpPlayground";
import { LATEST_PROTOCOL_VERSION, SUPPORTED_PROTOCOL_VERSIONS, mcpTools } from "@/core/mcp/server";

export const metadata: Metadata = {
  title: "MCP & API",
  description: "Connect an MCP client to Meridian's research tools, or call them over REST.",
};

const REST: Array<[string, string, string]> = [
  ["/api/mcp", "POST", "MCP JSON-RPC endpoint (Streamable HTTP, stateless)"],
  ["/api/tools", "GET", "Tool discovery with input and output JSON Schemas"],
  ["/api/tool/{name}", "POST", "Execute one tool with a JSON body"],
  ["/api/research", "POST", "Run a full research session server-side"],
  ["/api/experiments", "GET", "Reference experiment records"],
  ["/api/ai", "GET", "Bundle-landing models, metrics and explanations"],
  ["/api/jito", "GET", "Live tip floor and JitoSOL stats"],
  ["/api/health", "GET", "Deployment health and versions"],
];

export default function DevelopersPage() {
  const tools = mcpTools();
  return (
    <>
      <PageHeader
        eyebrow="Developer" accent="var(--color-mod-tools)"
        title="MCP & API"
        lede="Meridian runs a Model Context Protocol server. Any MCP client (Claude, the MCP Inspector or your own agent) can discover and call the same audited, read-only tools the research agents use."
      />
      <PageBody>
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <Section eyebrow="Connect" title="Connection guide">
              <EndpointSnippets />
            </Section>
          </div>
          <div className="lg:col-span-2">
            <Section eyebrow="Server" title="Protocol details">
              <div className="rounded-lg border border-line bg-paper p-4">
                <KeyValue k="Transport" v="Streamable HTTP (POST, JSON responses)" />
                <KeyValue k="Sessions" v="Stateless, no Mcp-Session-Id" />
                <KeyValue k="Protocol versions" v={<span className="text-right">{SUPPORTED_PROTOCOL_VERSIONS.join(", ")}</span>} />
                <KeyValue k="Default version" v={LATEST_PROTOCOL_VERSION} />
                <KeyValue k="Methods" v="initialize, ping, tools/list, tools/call" />
                <KeyValue k="Capabilities" v="tools" />
                <KeyValue k="Tools" v={`${tools.length}, all read-only`} />
                <KeyValue k="Authentication" v="None (public, read-only demo)" />
                <KeyValue k="Rate limit" v="120 requests / min / client (per instance)" />
              </div>
              <p className="mt-3 text-[0.8rem] text-faint">
                Tool results carry <code>structuredContent</code> validated against each tool&rsquo;s output schema, plus an audit
                block with input and output hashes. Browser clients must come from the same origin or localhost.
              </p>
            </Section>
          </div>
        </div>

        <Section eyebrow="Try it" title="Playground">
          <McpPlayground tools={tools.map((t) => ({ name: t.name, title: t.title, description: t.description }))} />
        </Section>

        <Section eyebrow="REST" title="HTTP endpoints">
          <div className="overflow-x-auto rounded-lg border border-line bg-paper">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-line-strong">
                  {["Path", "Method", "Purpose"].map((h) => (
                    <th key={h} className="px-4 py-3 text-[0.82rem] font-semibold text-faint">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {REST.map(([p, m, d]) => (
                  <tr key={p} className="border-b border-line last:border-b-0">
                    <td className="px-4 py-3"><code>{p}</code></td>
                    <td className="px-4 py-3 text-muted">{m}</td>
                    <td className="px-4 py-3 text-muted">{d}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-sm text-muted">
            Full input and output schemas are in the <Link href="/tools" className="text-link underline underline-offset-2">tool registry</Link>.
          </p>
        </Section>
      </PageBody>
    </>
  );
}
