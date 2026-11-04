import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader, PageBody, Section } from "@/components/layout/PageHeader";
import { DriftExplorer } from "@/components/experiment/DriftExplorer";
import { Stat, Severity, Badge } from "@/components/ui/primitives";
import { getMonitoringSnapshot } from "@/core/monitoring/metrics";
import { num, pct, dateShort, dateTime } from "@/lib/format";
import { datasetLabel, modelLabelShort } from "@/lib/labels";

export const metadata: Metadata = {
  title: "Model health",
  description: "Whether the data behind each model has shifted, how each model has scored, and how the research tools are behaving.",
};

export default async function ModelHealthPage() {
  const snap = await getMonitoringSnapshot();
  const s = snap.system;
  const d = snap.driftContext;

  return (
    <>
      <PageHeader
        eyebrow="Workspace" accent="var(--color-mod-monitoring)"
        title="Model health"
        lede="Are the models still reliable? This page checks whether the data they learned from has shifted, how each one scored when tested, and whether the research tools are running cleanly."
        actions={<Badge variant="muted">Generated {dateTime(snap.generatedAt)}</Badge>}
      />
      <PageBody>
        


        <Section
          title="Has the data shifted since the models learned from it?"
          right={<span>Max PSI {num(snap.drift.maxPsi)} · <Severity level={snap.drift.status} /></span>}
        >
          <div className="mb-4 grid grid-cols-1 gap-3 text-[0.85rem] md:grid-cols-3">
            <div className="rounded-lg border border-line bg-paper px-4 py-3">
              <div className="eyebrow">Reference population</div>
              <div className="mt-1 tnum">{d.referenceRows.toLocaleString("en-US")} hourly rows</div>
              <div className="tnum text-[0.78rem] text-faint">{dateShort(d.referenceSpan[0])} → {dateShort(d.referenceSpan[1])}</div>
            </div>
            <div className="rounded-lg border border-line bg-paper px-4 py-3">
              <div className="eyebrow">Current population</div>
              <div className="mt-1 tnum">{d.currentRows.toLocaleString("en-US")} hourly rows</div>
              <div className="tnum text-[0.78rem] text-faint">{dateShort(d.currentSpan[0])} → {dateShort(d.currentSpan[1])}</div>
            </div>
            <div className="rounded-lg border border-line bg-paper px-4 py-3">
              <div className="eyebrow">Thresholds</div>
              <div className="mt-1">Stable &lt; {d.thresholds.watch} · watch {d.thresholds.watch}–{d.thresholds.act} · act &gt; {d.thresholds.act}</div>
              <div className="text-[0.78rem] text-faint">10 quantile bins of the reference; dataset {datasetLabel(d.dataset)}</div>
            </div>
          </div>
          <DriftExplorer metrics={snap.drift.metrics} watch={d.thresholds.watch} act={d.thresholds.act} />
          {snap.drift.warnings.length > 0 ? (
            <ul className="mt-3 space-y-1 text-sm text-warning">
              {snap.drift.warnings.map((w, i) => <li key={i}>! {w}</li>)}
            </ul>
          ) : null}
        </Section>

        <Section title="How each model scored">
          <div className="overflow-x-auto rounded-lg border border-line bg-paper">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-line-strong">
                  {["Experiment", "Model", "AUC", "Net Sharpe", "Status"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-[0.82rem] font-semibold text-faint">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {snap.performance.map((p, i) => (
                  <tr key={i} className="border-b border-line last:border-b-0">
                    <td className="tnum px-4 py-3"><Link href={`/experiments/${p.experimentId}`} className="text-link underline-offset-2 hover:underline"><code>{p.experimentId}</code></Link></td>
                    <td className="px-4 py-3">{modelLabelShort(p.modelType)}</td>
                    <td className="tnum px-4 py-3 text-muted">{num(p.auc)}</td>
                    <td className="tnum px-4 py-3 text-muted">{p.sharpe === null ? "n/a" : num(p.sharpe, 2)}</td>
                    <td className="px-4 py-3 text-muted">{p.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
        <Section title="Research tools">
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line md:grid-cols-2">
            <Cell><Stat label="Tool calls" value={s.totalToolCalls} sub={`${s.runs} reference runs`} /></Cell>
            <Cell><Stat label="Error rate" value={pct(s.errorRate)} sub={`${s.errorCount} failed calls`} /></Cell>
          </div>
          <dl className="mt-3 grid grid-cols-1 gap-x-8 gap-y-1 text-[0.8rem] text-muted md:grid-cols-2">
            <div><dt className="inline text-faint">Source: </dt><dd className="inline">audit log of the seeded reference research runs</dd></div>
            <div><dt className="inline text-faint">Environment: </dt><dd className="inline">{s.environment}, this server instance</dd></div>
            <div><dt className="inline text-faint">Window: </dt><dd className="inline tnum">{dateTime(s.windowStart)} → {dateTime(s.windowEnd)}</dd></div>
            <div><dt className="inline text-faint">Error rate: </dt><dd className="inline">tool calls returning a structured error ÷ all tool calls</dd></div>
          </dl>
        </Section>
      </PageBody>
    </>
  );
}

function Cell({ children }: { children: React.ReactNode }) {
  return <div className="bg-paper px-5 py-5">{children}</div>;
}
