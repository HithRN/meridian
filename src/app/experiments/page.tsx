"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader, PageBody } from "@/components/layout/PageHeader";
import { Badge, Button, Severity } from "@/components/ui/primitives";
import { useExperiments } from "@/store/experiments";
import type { ExperimentSummary } from "@/core/experiments/store";
import { summarise } from "@/core/experiments/store";
import { num, dateShort } from "@/lib/format";

interface Row extends ExperimentSummary {
  source: "local" | "seed";
}

export default function ExperimentsPage() {
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
  const rows = [...localRows, ...serverRows];

  return (
    <>
      <PageHeader
        index="02"
        title="Experiments"
        lede="Every research run is a reproducible, versioned record. Your own runs persist in this browser; seeded reference runs are computed deterministically on the server."
        actions={
          local.length > 0 ? (
            <Button variant="secondary" onClick={clear}>
              Clear local history
            </Button>
          ) : (
            <Link href="/research"><Button>New research →</Button></Link>
          )
        }
      />
      <PageBody>
        {rows.length === 0 && loading ? (
          <Empty text="Loading experiments…" />
        ) : rows.length === 0 ? (
          <Empty text="No experiments yet. Run one from the Research workspace." />
        ) : (
          <div className="overflow-x-auto border border-line">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-ink">
                  {["", "Date", "Question", "Dataset", "Best", "AUC", "Sharpe", "Critique", "Source"].map((h) => (
                    <th key={h} className="px-3 py-3 text-left font-normal uppercase tracking-[0.1em] text-faint">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="group border-b border-line last:border-b-0 hover:bg-subtle">
                    <td className="px-3 py-3">
                      <Link href={`/experiments/${r.id}`} className="tnum text-faint underline-offset-2 hover:underline">
                        {r.id.replace("exp_", "")}
                      </Link>
                    </td>
                    <td className="tnum px-3 py-3 text-muted">{dateShort(r.createdAt)}</td>
                    <td className="max-w-md px-3 py-3">
                      <Link href={`/experiments/${r.id}`} className="line-clamp-2 hover:underline">
                        {r.question}
                      </Link>
                    </td>
                    <td className="px-3 py-3 text-muted">{r.datasetId.replace("synthetic-", "").replace("-hourly", "")}</td>
                    <td className="px-3 py-3">{r.bestModelType}</td>
                    <td className="tnum px-3 py-3 text-muted">{num(r.bestAuc)}</td>
                    <td className="tnum px-3 py-3 text-muted">{r.bestSharpe === null ? "—" : num(r.bestSharpe, 2)}</td>
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
      </PageBody>
    </>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="flex h-48 items-center justify-center border border-dashed border-line text-muted">
      {text}
    </div>
  );
}
