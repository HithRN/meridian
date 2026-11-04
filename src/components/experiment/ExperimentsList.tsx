"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Badge, Button, Severity } from "@/components/ui/primitives";
import { useExperiments } from "@/store/experiments";
import type { ExperimentSummary } from "@/core/experiments/store";
import { summarise } from "@/core/experiments/store";
import { num, dateShort } from "@/lib/format";
import { datasetLabel, modelLabelShort } from "@/lib/labels";

type SortKey = "createdAt" | "bestAuc" | "bestSharpe";

const SORTS: Array<{ key: SortKey; label: string }> = [
  { key: "createdAt", label: "Newest" },
  { key: "bestAuc", label: "Best AUC" },
  { key: "bestSharpe", label: "Best Sharpe" },
];

interface Row extends ExperimentSummary {
  source: "local" | "seed";
}

export function ExperimentsList() {
  const local = useExperiments((s) => s.results);
  const clear = useExperiments((s) => s.clear);
  const [server, setServer] = useState<ExperimentSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetch("/api/experiments")
      .then((r) => r.json())
      .then((d) => {
        if (active) setServer(d.experiments ?? []);
      })
      .catch(() => setServer([]))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const localRows: Row[] = local.map((r) => ({ ...summarise(r.record), source: "local" }));
  const localIds = new Set(localRows.map((r) => r.id));
  const serverRows: Row[] = server
    .filter((s) => !localIds.has(s.id))
    .map((s) => ({ ...s, source: "seed" }));
  const all = [...localRows, ...serverRows];
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("createdAt");
  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const found = needle ? all.filter((r) => `${r.title} ${r.question} ${r.datasetId} ${r.bestModelType}`.toLowerCase().includes(needle)) : all;
    return [...found].sort((a, b) => Number(b[sort] ?? -Infinity) - Number(a[sort] ?? -Infinity));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, sort, local, server]);

  return (
    <div>
              <div className="mb-4 flex flex-wrap items-center gap-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search experiments"
            aria-label="Search experiments"
            className="w-64 rounded-md border border-line bg-paper px-3 py-[6px] text-[0.95rem] outline-none focus:border-accent"
          />
          <div className="flex overflow-hidden rounded-md border border-line text-[0.9rem]" role="group" aria-label="Sort by">
            {SORTS.map((o) => (
              <button key={o.key} onClick={() => setSort(o.key)} aria-pressed={sort === o.key} className={sort === o.key ? "bg-accent px-3 py-[5px] text-on-accent" : "px-3 py-[5px] text-muted hover:bg-subtle"}>
                {o.label}
              </button>
            ))}
          </div>
          <span className="flex-1" />
          {local.length > 0 ? <Button variant="secondary" onClick={clear}>Clear local history</Button> : <Link href="/research#lab"><Button>New experiment →</Button></Link>}
        </div>
        {rows.length === 0 && loading ? (
          <Empty text="Loading experiments…" />
        ) : rows.length === 0 ? (
          <Empty text={search ? "No experiment matches that search." : "No experiments yet. Run one from the Research page."} />
        ) : (
          <div className="overflow-x-auto border border-line">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-line-strong">
                  {["Experiment", "Date", "Dataset", "Best model", "AUC", "Sharpe", "Critique", "Source"].map((h) => (
                    <th key={h} className="px-3 py-3 text-left font-normal text-faint">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="group border-b border-line last:border-b-0 hover:bg-subtle">
                    <td className="max-w-md px-3 py-3">
                      <Link href={`/experiments/${r.id}`} className="block leading-tight hover:underline">
                        {r.title}
                      </Link>
                      <span className="mt-1 line-clamp-1 block text-[0.78rem] text-faint">{r.question}</span>
                    </td>
                    <td className="tnum px-3 py-3 text-muted">{dateShort(r.createdAt)}</td>
                    <td className="px-3 py-3 text-muted">{datasetLabel(r.datasetId)}</td>
                    <td className="px-3 py-3">{modelLabelShort(r.bestModelType)}</td>
                    <td className="tnum px-3 py-3 text-muted">{num(r.bestAuc)}</td>
                    <td className="tnum px-3 py-3 text-muted">{r.bestSharpe === null ? "n/a" : num(r.bestSharpe, 2)}</td>
                    <td className="px-3 py-3"><Severity level={r.critiqueSeverity} /></td>
                    <td className="px-3 py-3">
                      <Badge variant={r.source === "local" ? "outline" : "muted"}>{r.source}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="flex h-48 items-center justify-center border border-dashed border-line text-muted">
      {text}
    </div>
  );
}
