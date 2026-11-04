"use client";

import * as React from "react";
import Link from "next/link";
import { Badge, Button } from "@/components/ui/primitives";
import { clearReports, loadReports } from "@/components/research/reportStore";
import type { MarketReport, Verdict } from "@/core/market/research/types";

const LABEL: Record<Verdict, { text: string; variant: "success" | "warning" | "info" | "muted" }> = {
  clear: { text: "Clear evidence", variant: "success" },
  inconclusive: { text: "Not proven", variant: "warning" },
  measured: { text: "Measured", variant: "info" },
  skipped: { text: "Could not run", variant: "muted" },
};

/** Live market research this browser has run, ready to reopen or run on fresh data. */
export function MarketReports() {
  const [reports, setReports] = React.useState<MarketReport[]>([]);

  React.useEffect(() => {
    const timer = setTimeout(() => setReports(loadReports()), 0);
    return () => clearTimeout(timer);
  }, []);

  if (!reports.length) {
    return (
      <div className="flex h-48 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-line text-muted">
        Reports you run on the live market are kept here, in this browser.
        <Link href="/research"><Button>Ask a question →</Button></Link>
      </div>
    );
  }

  return (
    <div>
      <ul className="overflow-hidden rounded-lg border border-line bg-paper">
        {reports.map((r) => (
          <li key={r.id} className="border-b border-divider transition-colors last:border-b-0 hover:bg-subtle">
            <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
              <div className="min-w-0 flex-1">
                <Link href={`/research?report=${r.id}`} className="text-[1.02rem] font-semibold text-heading underline-offset-2 hover:underline">{r.question}</Link>
                <p className="mt-1 line-clamp-2 text-[0.95rem] leading-snug text-muted">{r.answer.headline}</p>
                <div className="mt-2 text-[0.86rem] text-faint">
                  {new Date(r.createdAt).toISOString().slice(0, 16).replace("T", " ")} UTC · {r.plan.assets.join(", ")} · {r.tests.length} tests
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant={LABEL[r.answer.verdict].variant}>{LABEL[r.answer.verdict].text}</Badge>
                <Link href={`/research?q=${encodeURIComponent(r.question)}`} className="text-[0.9rem] text-link underline-offset-2 hover:underline">Run on fresh data</Link>
              </div>
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex justify-end">
        <Button
          variant="secondary"
          onClick={() => {
            clearReports();
            setReports([]);
          }}
        >
          Clear saved reports
        </Button>
      </div>
    </div>
  );
}
