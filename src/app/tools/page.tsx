import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader, PageBody } from "@/components/layout/PageHeader";
import { ToolBrowser, type ToolEntry } from "@/components/developer/ToolBrowser";
import { Badge } from "@/components/ui/primitives";
import { getToolManifest } from "@/core/tools";

export const metadata: Metadata = {
  title: "Tools",
  description: "Tool registry with strict input and output JSON Schemas, served over MCP and REST.",
};

const PERMISSION_LABEL: Record<string, string> = {
  "read-data": "Read data",
  experiment: "Experiment",
  backtest: "Backtest",
  monitoring: "Model health",
  "network-read": "Solana · Jito network",
  "coding-readonly": "Coding · read-only",
  "coding-restricted": "Coding · restricted",
};

export default function ToolsPage() {
  // Schemas carry class instances; the browser component needs plain data.
  const tools = JSON.parse(JSON.stringify(getToolManifest())) as ToolEntry[];

  return (
    <>
      <PageHeader
        eyebrow="Developer" accent="var(--color-mod-tools)"
        title="Tool registry"
        lede={
          <>
            Every capability the agents can call is a named tool with a strict Zod contract and a permission class. The same tools are
            served over the Model Context Protocol at{" "}
            <code className="rounded border border-line px-1">/api/mcp</code> and over REST at{" "}
            <code className="rounded border border-line px-1">POST /api/tool/&#123;name&#125;</code>. See{" "}
            <Link href="/developers" className="text-link underline underline-offset-2">MCP &amp; API</Link> to connect a client.
          </>
        }
        actions={<Badge variant="outline">{tools.length} tools</Badge>}
      />

      <PageBody>
        <ToolBrowser tools={tools} labels={PERMISSION_LABEL} />
      </PageBody>
    </>
  );
}
