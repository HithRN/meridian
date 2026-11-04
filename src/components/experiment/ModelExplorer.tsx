"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowDown } from "lucide-react";
import { Badge } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";

export interface ModelRow {
  key: string;
  experimentId: string;
  model: string;
  modelId: string;
  dataset: string;
  featureSet: string;
  n: number;
  auc: number;
  sharpe: number | null;
  sharpeSe: number | null;
  trades: number | null;
  maxDrawdown: number | null;
  status: string;
  built: string;
  isBest: boolean;
  isBaseline: boolean;
}

type BadgeVariant = "running" | "info" | "success" | "danger" | "neutral";
type SortKey = "n" | "auc" | "sharpe" | "trades" | "maxDrawdown";

const COLUMNS: Array<{ label: string; sort?: SortKey }> = [
  { label: "Model" },
  { label: "Dataset" },
  { label: "Feature set" },
  { label: "Tested on", sort: "n" },
  { label: "AUC", sort: "auc" },
  { label: "Net Sharpe ± SE", sort: "sharpe" },
  { label: "Trades", sort: "trades" },
  { label: "Max fall", sort: "maxDrawdown" },
  { label: "Status" },
  { label: "Date" },
];

/** Status tiles filter the table; column headings sort it. */
export function ModelExplorer({ statuses, rows }: { statuses: Array<{ status: string; meaning: string; variant: BadgeVariant }>; rows: ModelRow[] }) {
  const [filter, setFilter] = React.useState<string | null>(null);
  const [sort, setSort] = React.useState<SortKey>("auc");
  const variant = Object.fromEntries(statuses.map((s) => [s.status, s.variant]));

  const shown = rows
    .filter((r) => !filter || r.status === filter)
    .sort((a, b) => Number(b[sort] ?? -Infinity) - Number(a[sort] ?? -Infinity));

  return (
    <div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {statuses.map((s) => {
          const count = rows.filter((r) => r.status === s.status).length;
          const on = filter === s.status;
          return (
            <button
              key={s.status}
              onClick={() => setFilter(on ? null : s.status)}
              aria-pressed={on}
              className={cn("rounded-lg border bg-paper px-4 py-3 text-left transition-[border-color,box-shadow,transform] duration-150 hover:-translate-y-[1px] hover:shadow-[0_3px_10px_rgba(24,54,80,0.08)]", on ? "border-accent ring-1 ring-accent" : "border-line hover:border-line-strong")}
            >
              <div className="text-[0.9rem] capitalize text-muted">{s.status}</div>
              <div className="tnum mt-1 text-[1.6rem] font-semibold leading-none text-heading">{count}</div>
              <p className="mt-2 text-[0.82rem] leading-snug text-faint">{s.meaning}</p>
            </button>
          );
        })}
      </div>

      <div className="mt-4 overflow-x-auto rounded-lg border border-line bg-paper">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-line-strong">
              {COLUMNS.map((c) => (
                <th key={c.label} aria-sort={c.sort && sort === c.sort ? "descending" : undefined} className="whitespace-nowrap px-3 py-3 text-left text-[0.84rem] font-semibold text-faint">
                  {c.sort ? (
                    <button onClick={() => setSort(c.sort!)} className={cn("inline-flex items-center gap-1 transition-colors hover:text-heading", sort === c.sort && "text-heading")}>
                      {c.label}
                      {sort === c.sort ? <ArrowDown size={12} aria-hidden /> : null}
                    </button>
                  ) : (
                    c.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.key} className="border-b border-line transition-colors last:border-b-0 hover:bg-subtle">
                <td className="px-3 py-3">
                  <span className="flex items-center gap-2">
                    <Link href={`/experiments/${r.experimentId}`} className="text-link underline-offset-2 hover:underline">{r.model}</Link>
                    {r.isBest ? <Badge variant="solid">selected</Badge> : null}
                    {r.isBaseline ? <Badge variant="muted">baseline</Badge> : null}
                  </span>
                  <code className="text-[0.72rem] text-faint">{r.modelId}</code>
                </td>
                <td className="px-3 py-3 text-muted">{r.dataset}</td>
                <td className="px-3 py-3 text-muted"><code className="text-[0.75rem]">{r.featureSet}</code></td>
                <td className="tnum px-3 py-3 text-muted">{r.n.toLocaleString("en-US")}</td>
                <td className="tnum px-3 py-3 text-muted">{r.auc.toFixed(3)}</td>
                <td className="tnum whitespace-nowrap px-3 py-3 text-muted">{r.sharpe === null ? "n/a" : `${r.sharpe.toFixed(2)}${r.sharpeSe === null ? "" : ` ± ${r.sharpeSe.toFixed(2)}`}`}</td>
                <td className="tnum px-3 py-3 text-muted">{r.trades?.toLocaleString("en-US") ?? "n/a"}</td>
                <td className="tnum px-3 py-3 text-muted">{r.maxDrawdown === null ? "n/a" : `${(r.maxDrawdown * 100).toFixed(1)}%`}</td>
                <td className="px-3 py-3"><Badge variant={variant[r.status]}>{r.status}</Badge></td>
                <td className="tnum px-3 py-3 text-muted">{r.built}</td>
              </tr>
            ))}
            {shown.length === 0 ? (
              <tr><td colSpan={COLUMNS.length} className="px-3 py-8 text-center text-muted">No model has this status.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
