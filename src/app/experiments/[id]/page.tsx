"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { PageHeader, PageBody, Section } from "@/components/layout/PageHeader";
import { Card, CardBody, CardHeader, Button, Badge } from "@/components/ui/primitives";
import {
  StateStepper,
  MetricsTable,
  CritiqueList,
  TraceViewer,
  MetaStrip,
} from "@/components/experiment/parts";
import { ReportView } from "@/components/experiment/ReportView";
import { EquityChart } from "@/components/charts/EquityChart";
import { useExperiments } from "@/store/experiments";
import type { ExperimentRecord, Critique } from "@/core/schemas/experiment";
import type { TraceEvent } from "@/core/orchestrator/types";
import { dateTime } from "@/lib/format";

interface Detail {
  record: ExperimentRecord;
  trace: TraceEvent[];
  equityCurves: Record<string, Array<{ t: number; equity: number; drawdown: number }>>;
  reportMarkdown: string | null;
  critique: Critique | null;
}

export default function ExperimentDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const localGet = useExperiments((s) => s.get);

  // Derive the local (browser-persisted) run during render — no effect needed.
  const local = useMemo<Detail | null>(() => {
    const r = localGet(id);
    return r
      ? {
          record: r.record,
          trace: r.trace,
          equityCurves: r.equityCurves,
          reportMarkdown: r.reportMarkdown,
          critique: r.critique,
        }
      : null;
  }, [id, localGet]);

  const [remote, setRemote] = useState<Detail | null>(null);
  const [remoteStatus, setRemoteStatus] = useState<"idle" | "loading" | "missing">(
    local ? "idle" : "loading",
  );

  // The effect only performs the async server fetch when there is no local run;
  // all setState calls happen inside async callbacks, not synchronously.
  useEffect(() => {
    if (local) return;
    let active = true;
    fetch(`/api/experiments/${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("not found"))))
      .then((d) => {
        if (!active) return;
        setRemote({
          record: d.record,
          trace: d.trace ?? [],
          equityCurves: d.equityCurves ?? {},
          reportMarkdown: d.reportMarkdown ?? null,
          critique: d.record?.critique ?? null,
        });
      })
      .catch(() => active && setRemoteStatus("missing"));
    return () => {
      active = false;
    };
  }, [id, local]);

  const detail = local ?? remote;
  const status: "loading" | "ok" | "missing" = detail
    ? "ok"
    : remoteStatus === "missing"
      ? "missing"
      : "loading";

  if (status === "loading") {
    return (
      <>
        <PageHeader index="02" title="Experiment" />
        <PageBody><div className="h-48 border border-dashed border-line" /></PageBody>
      </>
    );
  }
  if (status === "missing" || !detail) {
    return (
      <>
        <PageHeader index="02" title="Experiment not found" lede={`No experiment with id ${id}.`} actions={<Link href="/experiments"><Button variant="secondary">Back to experiments</Button></Link>} />
        <PageBody><div /></PageBody>
      </>
    );
  }

  const { record } = detail;
  const best = record.models.find((m) => m.modelId === record.bestModelId);
  const equity = best ? detail.equityCurves[best.modelId] ?? [] : [];

  return (
    <>
      <PageHeader
        index="02"
        title={record.id}
        lede={record.question}
        actions={
          <div className="flex items-center gap-2">
            <Badge variant="muted">{record.status}</Badge>
            <Link href="/experiments"><Button variant="secondary">All experiments</Button></Link>
          </div>
        }
      />
      <PageBody>
        <div className="mb-8">
          <MetaStrip
            items={[
              { k: "Created", v: dateTime(record.createdAt) },
              { k: "Dataset", v: `${record.dataset.datasetId}@${record.dataset.version}` },
              { k: "Content hash", v: record.dataset.contentHash.slice(0, 12) },
              { k: "Seed", v: String(record.seed) },
              { k: "Kernel", v: record.versions.kernel },
              { k: "Tool calls", v: String(record.toolCalls) },
            ]}
          />
        </div>

        <Section eyebrow="Workflow" title="Reached states">
          <StateStepper current="REPORT_READY" />
        </Section>

        <Section eyebrow="Results" title="Model comparison">
          <MetricsTable models={record.models} bestModelId={record.bestModelId} baselineModelId={record.baselineModelId} />
        </Section>

        {best ? (
          <Section eyebrow="Best model" title={`Equity curve — ${best.modelType}`}>
            <Card>
              <CardHeader
                title="Out-of-sample equity"
                eyebrow={`Sharpe ${best.backtest?.sharpe.toFixed(2)} · Max DD ${((best.backtest?.maxDrawdown ?? 0) * 100).toFixed(1)}%`}
              />
              <CardBody><EquityChart data={equity} /></CardBody>
            </Card>
          </Section>
        ) : null}

        {detail.critique ? (
          <Section eyebrow="Adversarial review" title="Critic findings">
            <CritiqueList critique={detail.critique} />
          </Section>
        ) : null}

        {detail.reportMarkdown ? (
          <Section eyebrow="Report" title="Evidence report">
            <Card><CardBody><ReportView markdown={detail.reportMarkdown} /></CardBody></Card>
          </Section>
        ) : null}

        {detail.trace.length > 0 ? (
          <Section eyebrow="Audit" title="Replayable agent trace" right={`${detail.trace.length} events`}>
            <TraceViewer trace={detail.trace} />
          </Section>
        ) : null}
      </PageBody>
    </>
  );
}
