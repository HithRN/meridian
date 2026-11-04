"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

interface Metric {
  name: string;
  psi: number;
  meanShift: number;
  stdRatio: number;
  status: string;
}

function reading(m: Metric): string {
  const direction = m.meanShift >= 0 ? "higher" : "lower";
  const spread = m.stdRatio > 1.1 ? "and more spread out" : m.stdRatio < 0.9 ? "and less spread out" : "with a similar spread";
  return `Recent values of this input sit ${Math.abs(m.meanShift).toFixed(2)} standard deviations ${direction} than the data the models learned from, ${spread} (${m.stdRatio.toFixed(2)} times).`;
}

/** Choose your own alert level and see which model inputs would trigger it. */
export function DriftExplorer({ metrics, watch, act }: { metrics: Metric[]; watch: number; act: number }) {
  const [alert, setAlert] = React.useState(act);
  const [open, setOpen] = React.useState<string | null>(null);
  const ceiling = Math.max(act * 2, ...metrics.map((m) => m.psi * 1.2));
  const sorted = [...metrics].sort((a, b) => b.psi - a.psi);
  const flagged = sorted.filter((m) => m.psi >= alert);

  return (
    <div className="rounded-lg border border-line bg-paper">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-line px-5 py-4">
        <label className="flex flex-1 items-center gap-3 text-[0.95rem] text-ink" style={{ minWidth: 260 }}>
          <span className="whitespace-nowrap">Alert when shift exceeds</span>
          <input type="range" min={0.01} max={Number(ceiling.toFixed(2))} step={0.01} value={alert} onChange={(e) => setAlert(Number(e.target.value))} className="min-w-24 flex-1" aria-label="Alert level" />
          <span className="tnum w-10 font-semibold text-heading">{alert.toFixed(2)}</span>
        </label>
        <div className="text-[0.95rem] text-ink" aria-live="polite">
          <strong className="tnum">{flagged.length}</strong> of {metrics.length} inputs would alert
        </div>
        <button onClick={() => setAlert(act)} className="text-[0.9rem] text-link underline-offset-2 hover:underline">Reset to standard ({act})</button>
      </div>
      <ul>
        {sorted.map((m) => {
          const over = m.psi >= alert;
          const expanded = open === m.name;
          return (
            <li key={m.name} className="border-b border-divider last:border-b-0">
              <button onClick={() => setOpen(expanded ? null : m.name)} aria-expanded={expanded} className="grid w-full grid-cols-[minmax(7rem,12rem)_1fr_3.5rem_5rem] items-center gap-4 px-5 py-3 text-left transition-colors hover:bg-subtle">
                <span className="truncate text-[0.95rem] text-ink">{m.name}</span>
                <span className="relative h-[8px] rounded-full bg-subtle">
                  <span className={cn("absolute inset-y-0 left-0 rounded-full transition-[width,background-color] duration-200", over ? "bg-chart-risk" : "bg-accent")} style={{ width: `${Math.min(100, (m.psi / ceiling) * 100)}%` }} />
                  <span className="absolute inset-y-[-4px] w-[2px] bg-heading transition-[left] duration-100" style={{ left: `${Math.min(100, (alert / ceiling) * 100)}%` }} aria-hidden />
                </span>
                <span className="tnum text-right text-[0.95rem] text-muted">{m.psi.toFixed(3)}</span>
                <span className={cn("text-right text-[0.9rem]", over ? "font-semibold text-warning" : "text-muted")}>{over ? "Alert" : m.psi >= watch ? "Watch" : "Stable"}</span>
              </button>
              {expanded ? <p className="fade-up px-5 pb-3 text-[0.95rem] leading-relaxed text-muted">{reading(m)}</p> : null}
            </li>
          );
        })}
      </ul>
      <p className="border-t border-divider px-5 py-3 text-[0.88rem] text-faint">
        Shift is the population stability index. Common practice treats under {watch} as stable and over {act} as a reason to act. Select an input to read what changed.
      </p>
    </div>
  );
}
