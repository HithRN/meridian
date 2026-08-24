"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader, PageBody, Section } from "@/components/layout/PageHeader";
import { Button, Badge, Card, CardHeader, CardBody, Eyebrow } from "@/components/ui/primitives";
import {
  StateStepper,
  TraceViewer,
  MetricsTable,
  CritiqueList,
  MetaStrip,
} from "@/components/experiment/parts";
import { ReportView } from "@/components/experiment/ReportView";
import { EquityChart } from "@/components/charts/EquityChart";
import { useResearchRunner } from "@/hooks/useResearchRunner";
import { useSession } from "@/store/session";
import { type WorkflowState } from "@/core/orchestrator/states";
import { duration } from "@/lib/format";
import { modelLabel } from "@/lib/labels";

const EXAMPLES = [
  "Test whether a 20-period momentum signal contains predictive value on the bundled hourly dataset, compare three models, use walk-forward validation, include transaction costs, and produce an evidence report.",
  "Compare a logistic and a gradient-boosted model on the equity dataset with 6-fold rolling walk-forward validation and transaction costs.",
  "Evaluate a 30-period momentum strategy on the FX dataset with walk-forward validation and costs.",
];

export default function ResearchPage() {
  const [question, setQuestion] = useState(EXAMPLES[0]);
  const [seed, setSeed] = useState(42);
  const { webgpuSupported, mode, setMode, modelStatus, modelProgress, modelLabel, detectWebGpu } =
    useSession();
  const runner = useResearchRunner();

  useEffect(() => {
    detectWebGpu();
  }, [detectWebGpu]);

  const currentState: WorkflowState = useMemo(() => {
    if (runner.result) return runner.result.finalState;
    const states = runner.trace.filter((e) => e.kind === "state");
    return (states[states.length - 1]?.state ?? "RECEIVED") as WorkflowState;
  }, [runner.trace, runner.result]);

  const busy = runner.status === "running" || runner.status === "loading-model";

  return (
    <>
      <PageHeader
        index="01"
        title="Research workspace"
        lede="Pose a quantitative hypothesis. The orchestrator plans it, specialised agents execute it through deterministic tools, a critic tries to break it, and a reporter writes it up — live."
        actions={
          runner.status !== "idle" ? (
            <Button variant="secondary" onClick={runner.reset} disabled={busy}>
              New run
            </Button>
          ) : null
        }
      />

      <PageBody>
        {/* Composer */}
        <Section eyebrow="Question" title="Define the research task">
          <Card>
            <CardBody className="space-y-4">
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                rows={3}
                disabled={busy}
                className="w-full resize-y border border-line bg-paper px-4 py-3 text-[1.02rem] leading-relaxed outline-none focus:border-ink disabled:opacity-60"
                placeholder="e.g. Test whether a 20-period momentum signal has predictive value…"
              />
              <div className="flex flex-wrap gap-2">
                {EXAMPLES.map((ex, i) => (
                  <button
                    key={i}
                    disabled={busy}
                    onClick={() => setQuestion(ex)}
                    className="border border-line px-3 py-1 text-left text-[0.78rem] text-muted hover:border-ink hover:text-ink disabled:opacity-50"
                  >
                    Example {i + 1}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-end justify-between gap-4 border-t border-line pt-4">
                <div className="flex flex-wrap items-end gap-6">
                  {/* Reasoner mode */}
                  <div>
                    <Eyebrow>Reasoner</Eyebrow>
                    <div className="mt-1 flex border border-ink">
                      <ModeButton label="Deterministic" active={mode === "deterministic"} onClick={() => setMode("deterministic")} disabled={busy} />
                      <ModeButton
                        label="WebLLM"
                        active={mode === "webllm"}
                        onClick={() => setMode("webllm")}
                        disabled={busy || webgpuSupported === false}
                        title={webgpuSupported === false ? "WebGPU unavailable in this browser" : undefined}
                      />
                    </div>
                  </div>
                  {/* Seed */}
                  <div>
                    <Eyebrow>Seed</Eyebrow>
                    <input
                      type="number"
                      value={seed}
                      disabled={busy}
                      onChange={(e) => setSeed(Number(e.target.value) || 0)}
                      className="mt-1 w-28 border border-line bg-paper px-3 py-[6px] text-sm tnum outline-none focus:border-ink disabled:opacity-60"
                    />
                  </div>
                </div>
                <Button onClick={() => runner.run(question, seed, mode)} disabled={busy || question.trim().length < 8}>
                  {busy ? "Running…" : "Run research →"}
                </Button>
              </div>

              {mode === "webllm" && webgpuSupported === false ? (
                <p className="text-sm text-muted">
                  This browser does not expose WebGPU. The run will use the deterministic reasoner —
                  identical guarantees, no model download.
                </p>
              ) : null}

              {runner.status === "loading-model" ? (
                <ModelLoader progress={modelProgress} label={modelLabel} />
              ) : null}

              {modelStatus === "ready" && mode === "webllm" ? (
                <p className="text-sm text-muted">Browser-local model ready: <code>{modelLabel || "loaded"}</code>.</p>
              ) : null}
            </CardBody>
          </Card>
        </Section>

        {/* Non-fatal notice (e.g. WebLLM fell back to deterministic) */}
        {runner.notice ? (
          <div className="mb-8 border border-line bg-subtle px-4 py-3 text-sm text-muted">
            {runner.notice}
          </div>
        ) : null}

        {/* Live workflow */}
        {runner.status !== "idle" ? (
          <Section eyebrow="Workflow" title="State machine">
            <StateStepper current={currentState} />
          </Section>
        ) : null}

        {/* Trace */}
        {runner.trace.length > 0 ? (
          <Section
            eyebrow="Agent trace"
            title="What happened, in order"
            right={`${runner.trace.length} events`}
          >
            <TraceViewer trace={runner.trace} />
          </Section>
        ) : null}

        {runner.status === "error" ? (
          <Card className="border-ink">
            <CardBody>
              <Eyebrow>Run failed</Eyebrow>
              <p className="mt-2 text-sm">{runner.error}</p>
            </CardBody>
          </Card>
        ) : null}

        {/* Results */}
        {runner.result ? <Results result={runner.result} /> : null}
      </PageBody>
    </>
  );
}

function ModeButton({
  label,
  active,
  onClick,
  disabled,
  title,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={
        "px-3 py-[6px] text-sm transition-colors disabled:opacity-40 " +
        (active ? "bg-ink text-paper" : "bg-paper text-ink hover:bg-subtle")
      }
    >
      {label}
    </button>
  );
}

function ModelLoader({ progress, label }: { progress: number; label: string }) {
  return (
    <div className="border border-line px-4 py-3">
      <div className="flex items-center justify-between text-sm">
        <span>Downloading browser-local model…</span>
        <span className="tnum">{Math.round(progress * 100)}%</span>
      </div>
      <div className="mt-2 h-[3px] w-full bg-line">
        <div className="h-full bg-ink transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
      </div>
      <p className="mt-2 truncate text-[0.72rem] text-faint">{label}</p>
    </div>
  );
}

function Results({ result }: { result: import("@/core/orchestrator/types").OrchestrationResult }) {
  const best = result.record.models.find((m) => m.modelId === result.record.bestModelId);
  const equity = best ? result.equityCurves[best.modelId] ?? [] : [];

  const download = (name: string, content: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <Section
        eyebrow="Results"
        title="Model comparison"
        right={`${result.reasoner} · seed ${result.seed}`}
      >
        <div className="mb-5">
          <MetaStrip
            items={[
              { k: "Experiment", v: result.record.id },
              { k: "Dataset", v: `${result.record.dataset.datasetId}@${result.record.dataset.version}` },
              { k: "Rows", v: String(result.record.dataset.rows) },
              { k: "Tool calls", v: String(result.record.toolCalls) },
              { k: "Runtime", v: duration(result.finishedAt - result.startedAt) },
            ]}
          />
        </div>
        <MetricsTable
          models={result.record.models}
          bestModelId={result.record.bestModelId}
          baselineModelId={result.record.baselineModelId}
        />
      </Section>

      {best ? (
        <Section eyebrow="Best model" title={`Equity curve — ${modelLabel(best.modelType)}`}>
          <Card>
            <CardHeader
              title="Out-of-sample equity (net of costs)"
              eyebrow={`Sharpe ${best.backtest?.sharpe.toFixed(2)} · Max DD ${((best.backtest?.maxDrawdown ?? 0) * 100).toFixed(1)}%`}
              right={<Badge variant="muted">{equity.length} points</Badge>}
            />
            <CardBody>
              <EquityChart data={equity} />
            </CardBody>
          </Card>
        </Section>
      ) : null}

      <Section eyebrow="Adversarial review" title="Critic findings">
        <CritiqueList critique={result.critique} />
      </Section>

      <Section
        eyebrow="Report"
        title="Evidence report"
        right={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => download(`${result.record.id}.md`, result.reportMarkdown, "text/markdown")}>
              Export Markdown
            </Button>
            <Button variant="secondary" onClick={() => download(`${result.record.id}.json`, JSON.stringify(result.record, null, 2), "application/json")}>
              Export JSON
            </Button>
          </div>
        }
      >
        <Card>
          <CardBody>
            <ReportView markdown={result.reportMarkdown} />
          </CardBody>
        </Card>
      </Section>
    </>
  );
}
