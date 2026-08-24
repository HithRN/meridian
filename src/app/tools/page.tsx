import type { Metadata } from "next";
import { PageHeader, PageBody, Section } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/primitives";
import { getToolManifest } from "@/core/tools";

export const metadata: Metadata = {
  title: "Tools",
  description: "MCP-compatible tool catalog with strict input and output JSON Schemas.",
};

const PERMISSION_LABEL: Record<string, string> = {
  "read-data": "Read data",
  experiment: "Experiment",
  backtest: "Backtest",
  monitoring: "Monitoring",
  "coding-readonly": "Coding · read-only",
  "coding-restricted": "Coding · restricted",
};

export default function ToolsPage() {
  const tools = getToolManifest();
  const groups = groupBy(tools, (t) => t.permission);

  return (
    <>
      <PageHeader
        index="05"
        title="Tool catalog"
        lede={
          <>
            Every capability the agents can call is a named tool with a strict Zod contract, surfaced
            here as MCP-compatible JSON Schemas. Discovery is available at{" "}
            <code className="border border-line px-1">GET /api/tools</code>; single-tool execution at{" "}
            <code className="border border-line px-1">POST /api/tool/&#123;name&#125;</code>.
          </>
        }
        actions={<Badge variant="outline">{tools.length} tools</Badge>}
      />

      <PageBody>
        {Object.entries(groups).map(([permission, group]) => (
          <Section key={permission} eyebrow={PERMISSION_LABEL[permission] ?? permission} title={`${group.length} tool${group.length === 1 ? "" : "s"}`}>
            <div className="border border-line">
              {group.map((tool) => (
                <details key={tool.name} className="border-b border-line last:border-b-0">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 hover:bg-subtle">
                    <div className="min-w-0">
                      <div className="flex items-center gap-3">
                        <code className="text-base">{tool.name}</code>
                        {tool.deterministic ? <Badge variant="muted">deterministic</Badge> : null}
                      </div>
                      <p className="mt-1 truncate text-sm text-muted">{tool.description}</p>
                    </div>
                    <span aria-hidden className="text-faint">▾</span>
                  </summary>
                  <div className="grid grid-cols-1 gap-px border-t border-line bg-line md:grid-cols-2">
                    <SchemaBlock label="Input schema" schema={tool.inputSchema} />
                    <SchemaBlock label="Output schema" schema={tool.outputSchema} />
                  </div>
                </details>
              ))}
            </div>
          </Section>
        ))}
      </PageBody>
    </>
  );
}

function SchemaBlock({ label, schema }: { label: string; schema: unknown }) {
  return (
    <div className="bg-paper px-5 py-4">
      <div className="eyebrow mb-2">{label}</div>
      <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words text-[0.78rem] leading-relaxed text-muted">
        {JSON.stringify(schema, null, 2)}
      </pre>
    </div>
  );
}

function groupBy<T>(items: T[], key: (t: T) => string): Record<string, T[]> {
  return items.reduce<Record<string, T[]>>((acc, item) => {
    const k = key(item);
    (acc[k] ??= []).push(item);
    return acc;
  }, {});
}
