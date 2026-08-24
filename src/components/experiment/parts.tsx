"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { Badge, Severity } from "@/components/ui/primitives";
import { pct, num, duration, dateTime } from "@/lib/format";
import { modelLabel } from "@/lib/labels";
import type { ModelResult, Critique } from "@/core/schemas/experiment";
import type { TraceEvent } from "@/core/orchestrator/types";
import { WORKFLOW_STATES, stateIndex, type WorkflowState } from "@/core/orchestrator/states";

/* -------------------------------------------------------------- StateStepper */
export function StateStepper({ current }: { current: WorkflowState }) {
  const currentIdx = stateIndex(current);
  return (
    <ol className="grid grid-cols-3 gap-px border border-line bg-line sm:grid-cols-9">
      {WORKFLOW_STATES.map((s, i) => {
        const reached = i <= currentIdx;
        const active = i === currentIdx;
        return (
          <li
            key={s}
            className={cn(
              "px-2 py-3",
              active ? "bg-ink text-paper" : reached ? "bg-subtle" : "bg-paper",
            )}
          >
            <div className={cn("tnum text-[0.62rem]", active ? "text-paper/70" : "text-faint")}>
              {String(i + 1).padStart(2, "0")} {reached && !active ? "✓" : ""}
            </div>
            <div className="mt-1 text-[0.68rem] leading-tight">{s.replace(/_/g, " ")}</div>
          </li>
        );
      })}
    </ol>
  );
}

/* -------------------------------------------------------------- MetricsTable */
const COLS: Array<{ key: string; label: string; get: (m: ModelResult) => string }> = [
  { key: "auc", label: "AUC", get: (m) => num(m.metrics.auc) },
  { key: "acc", label: "Accuracy", get: (m) => num(m.metrics.accuracy) },
  { key: "f1", label: "F1", get: (m) => num(m.metrics.f1) },
  { key: "ll", label: "LogLoss", get: (m) => num(m.metrics.logLoss) },
  { key: "ic", label: "IC", get: (m) => num(m.metrics.informationCoefficient, 4) },
  { key: "sh", label: "Sharpe", get: (m) => (m.backtest ? num(m.backtest.sharpe, 2) : "—") },
  { key: "dd", label: "Max DD", get: (m) => (m.backtest ? pct(m.backtest.maxDrawdown) : "—") },
  { key: "to", label: "Turnover", get: (m) => (m.backtest ? num(m.backtest.turnover, 1) : "—") },
  { key: "ret", label: "Return", get: (m) => (m.backtest ? pct(m.backtest.totalReturn) : "—") },
];

export function MetricsTable({
  models,
  bestModelId,
  baselineModelId,
}: {
  models: ModelResult[];
  bestModelId?: string;
  baselineModelId?: string;
}) {
  return (
    <div className="overflow-x-auto border border-line">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-ink">
            <th className="px-4 py-3 text-left font-normal uppercase tracking-[0.1em] text-faint">Model</th>
            {COLS.map((c) => (
              <th key={c.key} className="px-3 py-3 text-right font-normal uppercase tracking-[0.1em] text-faint">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {models.map((m) => {
            const isBest = m.modelId === bestModelId;
            return (
              <tr key={m.modelId} className={cn("border-b border-line last:border-b-0", isBest && "bg-subtle")}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span aria-hidden className="w-3 text-ink">{isBest ? "▶" : ""}</span>
                    <span className={cn(isBest && "font-semibold")}>{modelLabel(m.modelType)}</span>
                    {m.modelId === baselineModelId ? <Badge variant="muted">baseline</Badge> : null}
                    {isBest ? <Badge variant="solid">best</Badge> : null}
                  </div>
                </td>
                {COLS.map((c) => (
                  <td key={c.key} className="tnum px-3 py-3 text-right text-muted">
                    {c.get(m)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* --------------------------------------------------------------- CritiqueList */
export function CritiqueList({ critique }: { critique: Critique }) {
  return (
    <div>
      <div className="mb-3 flex items-center gap-3">
        <Badge variant={critique.passed ? "outline" : "solid"}>
          {critique.passed ? "No high-severity objection" : "Objections stand"}
        </Badge>
        <span className="text-sm text-muted">
          Max severity: <Severity level={critique.severity} />
        </span>
      </div>
      {critique.findings.length === 0 ? (
        <p className="text-sm text-muted">The critic raised no substantiated objections.</p>
      ) : (
        <ul className="border border-line">
          {critique.findings.map((f, i) => (
            <li key={i} className="flex gap-4 border-b border-line px-4 py-3 last:border-b-0">
              <span className="mt-[2px] w-16 shrink-0"><Severity level={f.severity} /></span>
              <span className="min-w-0">
                <code className="text-[0.82rem]">{f.code}</code>
                <p className="mt-1 text-sm text-muted">{f.message}</p>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- TraceViewer */
const KIND_MARK: Record<TraceEvent["kind"], string> = {
  state: "◆",
  agent: "•",
  tool: "▚",
  reasoning: "›",
  warning: "!",
  error: "×",
};

export function TraceViewer({ trace }: { trace: TraceEvent[] }) {
  return (
    <div className="border border-line">
      {trace.map((e) => (
        <TraceRow key={e.seq} event={e} />
      ))}
      {trace.length === 0 ? (
        <div className="px-4 py-6 text-center text-sm text-faint">No trace events yet.</div>
      ) : null}
    </div>
  );
}

function TraceRow({ event }: { event: TraceEvent }) {
  const [open, setOpen] = useState(false);
  const hasDetail = event.kind === "tool" && !!event.tool;
  const agent = event.agentId.replace(/-/g, " ");

  return (
    <div className="border-b border-line last:border-b-0">
      <button
        type="button"
        onClick={() => hasDetail && setOpen((v) => !v)}
        className={cn(
          "flex w-full items-start gap-3 px-4 py-2.5 text-left",
          hasDetail ? "cursor-pointer hover:bg-subtle" : "cursor-default",
          event.kind === "warning" && "bg-subtle",
          event.kind === "error" && "bg-ink text-paper",
        )}
      >
        <span aria-hidden className="tnum mt-[2px] w-6 shrink-0 text-center text-xs text-faint">
          {KIND_MARK[event.kind]}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-[0.7rem] uppercase tracking-[0.12em] text-faint">{agent}</span>
            <span className="text-sm">{event.title}</span>
            {event.tool ? (
              <span className={cn("tnum text-[0.72rem]", event.kind === "error" ? "text-paper/70" : "text-faint")}>
                {event.tool.inputHash}{event.tool.outputHash ? `→${event.tool.outputHash}` : ""} · {duration(event.tool.durationMs)}
              </span>
            ) : null}
          </span>
          {event.detail ? (
            <span className={cn("mt-0.5 block text-sm", event.kind === "error" ? "text-paper/80" : "text-muted")}>
              {event.detail}
            </span>
          ) : null}
        </span>
        {hasDetail ? <span aria-hidden className="text-faint">{open ? "−" : "+"}</span> : null}
      </button>
      {open && event.tool ? (
        <div className="grid grid-cols-1 gap-px border-t border-line bg-line md:grid-cols-2">
          <JsonPane label="Input" value={event.tool.input} />
          <JsonPane label="Output" value={event.tool.error ? { error: event.tool.error } : event.tool.output} />
        </div>
      ) : null}
    </div>
  );
}

function JsonPane({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="bg-paper px-4 py-3">
      <div className="eyebrow mb-1">{label}</div>
      <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words text-[0.74rem] leading-relaxed text-muted">
        {safeStringify(value)}
      </pre>
    </div>
  );
}

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(
      v,
      (_k, val) => (Array.isArray(val) && val.length > 40 ? `[${val.length} items]` : val),
      2,
    );
  } catch {
    return String(v);
  }
}

/* --------------------------------------------------------------- MetaStrip */
export function MetaStrip({ items }: { items: Array<{ k: string; v: string }> }) {
  return (
    <dl className="flex flex-wrap gap-x-8 gap-y-2">
      {items.map((it) => (
        <div key={it.k}>
          <dt className="eyebrow">{it.k}</dt>
          <dd className="tnum text-sm">{it.v}</dd>
        </div>
      ))}
    </dl>
  );
}

export { dateTime };
