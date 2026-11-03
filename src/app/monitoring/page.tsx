import type { Metadata } from "next";
import { PageHeader, PageBody, Section } from "@/components/layout/PageHeader";
import { Card, CardHeader, CardBody, Stat, Severity, Badge } from "@/components/ui/primitives";
import { HistoryChart } from "@/components/charts/HistoryChart";
import { getMonitoringSnapshot } from "@/core/monitoring/metrics";
import { num, pct, dateShort, dateTime } from "@/lib/format";
import { modelLabelShort } from "@/lib/labels";

export const metadata: Metadata = {
  title: "Monitoring",
  description: "Distributional drift, model performance history and measured tool-execution telemetry, each labelled with its source.",
};

export default async function MonitoringPage() {
  const snap = await getMonitoringSnapshot();
  const s = snap.system;
  const d = snap.driftContext;

  return (
    <>
      <PageHeader
        eyebrow="Workspace" accent="var(--color-mod-monitoring)"
        title="Monitoring"
        lede="Feature drift, model-performance history and tool-execution telemetry. Each panel states whether its figures are measured or simulated, over what sample, and where."
        actions={<Badge variant="muted">Generated {dateTime(snap.generatedAt)}</Badge>}
      />
      <PageBody>
        <Section eyebrow="Measured · tool execution" title="Tool-call telemetry">
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line md:grid-cols-5">
            <Cell><Stat label="p50 latency" value={`${s.p50Ms} ms`} /></Cell>
            <Cell><Stat label="p95 latency" value={`${s.p95Ms} ms`} /></Cell>
            <Cell><Stat label="p99 latency" value={`${s.p99Ms} ms`} /></Cell>
            <Cell><Stat label="Tool calls" value={s.totalToolCalls} sub={`${s.runs} reference runs`} /></Cell>
            <Cell><Stat label="Error rate" value={pct(s.errorRate)} sub={`${s.errorCount} failed calls`} /></Cell>
          </div>
          <dl className="mt-3 grid grid-cols-1 gap-x-8 gap-y-1 text-[0.8rem] text-muted md:grid-cols-2">
            <div><dt className="inline text-faint">Source: </dt><dd className="inline">audit log of the seeded reference research runs</dd></div>
            <div><dt className="inline text-faint">Environment: </dt><dd className="inline">{s.environment}, this server instance</dd></div>
            <div><dt className="inline text-faint">Window: </dt><dd className="inline tnum">{dateTime(s.windowStart)} → {dateTime(s.windowEnd)}</dd></div>
            <div><dt className="inline text-faint">Error rate: </dt><dd className="inline">tool calls returning a structured error ÷ all tool calls</dd></div>
          </dl>
          <p className="mt-3 max-w-3xl text-[0.8rem] text-faint">
            No uptime figure is shown: the demo has no external availability monitor, so any uptime number would be invented.
          </p>
        </Section>

        <Section eyebrow="Simulated · layout preview" title="Latency over time">
          <Card>
            <CardHeader
              title="p50 vs p95 execution time"
              eyebrow="Milliseconds · illustrative"
              right={<Badge variant="warning">Simulated data</Badge>}
            />
            <CardBody>
              <HistoryChart
                data={snap.latencyHistory as unknown as Array<Record<string, number>>}
                series={[
                  { key: "p50", label: "p50" },
                  { key: "p95", label: "p95", dashed: true },
                ]}
                xFormat="hour"
              />
              <p className="mt-3 text-[0.78rem] text-faint">
                A seeded synthetic series showing how historical telemetry would be displayed. It is not measured; real history needs
                persistent metrics storage (for example OpenTelemetry export), which the demo does not have.
              </p>
            </CardBody>
          </Card>
        </Section>

        <Section
          eyebrow="Measured · synthetic dataset"
          title="Feature drift (population stability index)"
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
              <div className="text-[0.78rem] text-faint">10 quantile bins of the reference; dataset <code>{d.dataset}</code></div>
            </div>
          </div>
          <div className="overflow-x-auto rounded-lg border border-line bg-paper">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-line-strong">
                  {["Feature", "PSI", "PSI vs act threshold", "Mean shift (σ)", "Std ratio", "Status"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-[0.68rem] font-medium uppercase tracking-[0.08em] text-faint">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {snap.drift.metrics.map((m) => (
                  <tr key={m.name} className="border-b border-line last:border-b-0">
                    <td className="px-4 py-3">{m.name}</td>
                    <td className="tnum px-4 py-3 text-muted">{num(m.psi)}</td>
                    <td className="px-4 py-3">
                      <div className="relative h-[8px] w-40 rounded-full bg-subtle">
                        <div className="absolute inset-y-0 left-0 rounded-full bg-accent" style={{ width: `${Math.min(100, (m.psi / d.thresholds.act) * 100)}%` }} />
                        <div className="absolute inset-y-[-3px] w-px bg-warning" style={{ left: `${(d.thresholds.watch / d.thresholds.act) * 100}%` }} title="Watch threshold" />
                      </div>
                    </td>
                    <td className="tnum px-4 py-3 text-muted">{num(m.meanShift, 2)}</td>
                    <td className="tnum px-4 py-3 text-muted">{num(m.stdRatio, 2)}</td>
                    <td className="px-4 py-3"><Severity level={m.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {snap.drift.warnings.length > 0 ? (
            <ul className="mt-3 space-y-1 text-sm text-warning">
              {snap.drift.warnings.map((w, i) => <li key={i}>! {w}</li>)}
            </ul>
          ) : null}
        </Section>

        <Section eyebrow="Measured · reference runs" title="Model evaluation history">
          <div className="overflow-x-auto rounded-lg border border-line bg-paper">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-line-strong">
                  {["Experiment", "Model", "AUC", "Net Sharpe", "Status"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-[0.68rem] font-medium uppercase tracking-[0.08em] text-faint">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {snap.performance.map((p, i) => (
                  <tr key={i} className="border-b border-line last:border-b-0">
                    <td className="tnum px-4 py-3 text-muted"><code>{p.experimentId}</code></td>
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
      </PageBody>
    </>
  );
}

function Cell({ children }: { children: React.ReactNode }) {
  return <div className="bg-paper px-5 py-5">{children}</div>;
}
