import type { Metadata } from "next";
import { PageHeader, PageBody, Section } from "@/components/layout/PageHeader";
import { Card, CardHeader, CardBody, Stat, Severity, Badge } from "@/components/ui/primitives";
import { HistoryChart } from "@/components/charts/HistoryChart";
import { getMonitoringSnapshot } from "@/core/monitoring/metrics";
import { num, pct } from "@/lib/format";

export const metadata: Metadata = {
  title: "Monitoring",
  description: "Distributional drift, model performance history and system health.",
};

export default async function MonitoringPage() {
  const snap = await getMonitoringSnapshot();

  return (
    <>
      <PageHeader
        index="04"
        title="Monitoring"
        lede="Distributional drift on the live feature space, model-performance history, and system health derived from the audited tool calls."
        actions={<Badge variant="muted">generated {new Date(snap.generatedAt).toISOString().slice(11, 16)}Z</Badge>}
      />
      <PageBody>
        {/* System health */}
        <Section eyebrow="System health" title="Service metrics">
          <div className="grid grid-cols-2 gap-px border border-line bg-line md:grid-cols-5">
            <Cell><Stat label="p50 latency" value={`${snap.system.p50Ms}ms`} /></Cell>
            <Cell><Stat label="p95 latency" value={`${snap.system.p95Ms}ms`} /></Cell>
            <Cell><Stat label="Tool calls" value={snap.system.totalToolCalls} /></Cell>
            <Cell><Stat label="Error rate" value={pct(snap.system.errorRate)} /></Cell>
            <Cell><Stat label="Uptime" value={`${snap.system.uptimePct}%`} /></Cell>
          </div>
        </Section>

        {/* Latency history */}
        <Section eyebrow="Latency" title="Tool execution latency (24h)">
          <Card>
            <CardHeader title="p50 vs p95 execution time" eyebrow="milliseconds" />
            <CardBody>
              <HistoryChart
                data={snap.latencyHistory as unknown as Array<Record<string, number>>}
                series={[
                  { key: "p50", label: "p50" },
                  { key: "p95", label: "p95", dashed: true },
                ]}
                xFormat="hour"
              />
            </CardBody>
          </Card>
        </Section>

        {/* Drift */}
        <Section eyebrow="Data drift" title="Population stability (reference vs current)" right={<span>Max PSI {num(snap.drift.maxPsi)} · <Severity level={snap.drift.status} /></span>}>
          <div className="overflow-x-auto border border-line">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-ink">
                  {["Feature", "PSI", "Mean shift (σ)", "Std ratio", "Status"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left font-normal uppercase tracking-[0.1em] text-faint">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {snap.drift.metrics.map((m) => (
                  <tr key={m.name} className="border-b border-line last:border-b-0">
                    <td className="px-4 py-3">{m.name}</td>
                    <td className="tnum px-4 py-3 text-muted">{num(m.psi)}</td>
                    <td className="tnum px-4 py-3 text-muted">{num(m.meanShift, 2)}</td>
                    <td className="tnum px-4 py-3 text-muted">{num(m.stdRatio, 2)}</td>
                    <td className="px-4 py-3"><Severity level={m.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {snap.drift.warnings.length > 0 ? (
            <ul className="mt-3 space-y-1 text-sm text-muted">
              {snap.drift.warnings.map((w, i) => <li key={i}>! {w}</li>)}
            </ul>
          ) : null}
        </Section>

        {/* Performance history */}
        <Section eyebrow="Model performance" title="Evaluation history">
          <div className="overflow-x-auto border border-line">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-ink">
                  {["Experiment", "Model", "AUC", "Sharpe", "Status"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left font-normal uppercase tracking-[0.1em] text-faint">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {snap.performance.map((p, i) => (
                  <tr key={i} className="border-b border-line last:border-b-0">
                    <td className="tnum px-4 py-3 text-muted">{p.experimentId}</td>
                    <td className="px-4 py-3">{p.modelType}</td>
                    <td className="tnum px-4 py-3 text-muted">{num(p.auc)}</td>
                    <td className="tnum px-4 py-3 text-muted">{p.sharpe === null ? "—" : num(p.sharpe, 2)}</td>
                    <td className="px-4 py-3"><Badge variant="muted">{p.status}</Badge></td>
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
