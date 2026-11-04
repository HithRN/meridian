"use client";

import * as React from "react";
import { Badge } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";

export interface ToolEntry {
  name: string;
  description: string;
  permission: string;
  deterministic: boolean;
  inputSchema: unknown;
  outputSchema: unknown;
}

/** Search the tools and narrow them by permission; open one to read its schemas. */
export function ToolBrowser({ tools, labels }: { tools: ToolEntry[]; labels: Record<string, string> }) {
  const [search, setSearch] = React.useState("");
  const [permission, setPermission] = React.useState<string | null>(null);
  const permissions = [...new Set(tools.map((t) => t.permission))];
  const needle = search.trim().toLowerCase();
  const shown = tools.filter((t) => (!permission || t.permission === permission) && (!needle || `${t.name} ${t.description}`.toLowerCase().includes(needle)));

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tools"
          aria-label="Search tools"
          className="w-56 rounded-md border border-line bg-paper px-3 py-[6px] text-[0.95rem] outline-none focus:border-accent"
        />
        <FilterChip on={permission === null} onClick={() => setPermission(null)}>All {tools.length}</FilterChip>
        {permissions.map((p) => (
          <FilterChip key={p} on={permission === p} onClick={() => setPermission(permission === p ? null : p)}>
            {labels[p] ?? p} {tools.filter((t) => t.permission === p).length}
          </FilterChip>
        ))}
      </div>
      <div className="overflow-hidden rounded-lg border border-line bg-paper">
        {shown.map((tool) => (
          <details key={tool.name} className="border-b border-line last:border-b-0">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-subtle">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-3">
                  <code className="text-base">{tool.name}</code>
                  <Badge variant="muted">{labels[tool.permission] ?? tool.permission}</Badge>
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
        {shown.length === 0 ? <p className="px-5 py-8 text-center text-muted">No tool matches.</p> : null}
      </div>
    </div>
  );
}

function FilterChip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-pressed={on} className={cn("rounded-full border px-3 py-[3px] text-[0.88rem] transition-colors", on ? "border-accent bg-accent text-on-accent" : "border-line text-muted hover:border-accent hover:text-heading")}>
      {children}
    </button>
  );
}

function SchemaBlock({ label, schema }: { label: string; schema: unknown }) {
  return (
    <div className="bg-paper px-5 py-4">
      <div className="eyebrow mb-2">{label}</div>
      <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words text-[0.78rem] leading-relaxed text-muted">{JSON.stringify(schema, null, 2)}</pre>
    </div>
  );
}
