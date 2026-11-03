"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader, PageBody, Section } from "@/components/layout/PageHeader";
import { Button, Card, CardHeader, CardBody, Eyebrow } from "@/components/ui/primitives";
import {
  StateStepper,
  TraceViewer,
  MetricsTable,
  CritiqueList,
  MetaStrip,
} from "@/components/experiment/parts";
import { ReportView } from "@/components/experiment/ReportView";
import { Tabs } from "@/components/ui/Tabs";
import { AccuracyBars, DrawdownChart, GrowthChart, MonthlyReturns } from "@/components/charts/PlainCharts";
import { BacktestContext } from "@/components/experiment/BacktestContext";
import { useResearchRunner } from "@/hooks/useResearchRunner";
import { useSession } from "@/store/session";
import { type WorkflowState } from "@/core/orchestrator/states";
import { duration } from "@/lib/format";
import { modelLabel } from "@/lib/labels";

const EXAMPLES = [
  "Test whether a 24-period momentum signal has predictive value on the SOL dataset, compare three models, use walk-forward validation and include transaction costs.",
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
        eyebrow="Workspace" accent="var(--color-mod-research)"
        title="Research workspace"
        lede="Pose a quantitative hypothesis. The orchestrator plans it, specialised agents execute it through deterministic tools, a critic tries to break it, and a reporter writes it up while you watch."
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
                className="w-full resize-y border border-line bg-paper px-4 py-3 text-[1.02rem] leading-relaxed outline-none focus:border-accent disabled:opacity-60"
                placeholder="e.g. Test whether a 20-period momentum signal has predictive value…"
              />
              <div className="flex flex-wrap gap-2">
                {EXAMPLES.map((ex, i) => (
                  <button
                    key={i}
                    disabled={busy}
                    onClick={() => setQuestion(ex)}
                    className="border border-line px-3 py-1 text-left text-[0.78rem] text-muted hover:border-accent hover:text-ink disabled:opacity-50"
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
                    <div className="mt-1 flex border border-accent">
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
                      className="mt-1 w-28 border border-line bg-paper px-3 py-[6px] text-sm tnum outline-none focus:border-accent disabled:opacity-60"
                    />
                  </div>
                </div>
                <Button onClick={() => runner.run(question, seed, mode)} disabled={busy || question.trim().length < 8}>
                  {busy ? "Running…" : "Run research →"}
                </Button>
              </div>

              {mode === "webllm" && webgpuSupported === false ? (
                <p className="text-sm text-muted">
                  No usable WebGPU adapter in this browser. The run will use the deterministic reasoner,
                  with identical guarantees and no model download.
                </p>
              ) : null}
              {mode === "webllm" && webgpuSupported ? (
                <p className="text-[0.8rem] text-faint">
                  WebLLM downloads Llama-3.2-1B (about 0.9 GB, cached by your browser after the first run) and runs it on your GPU;
                  nothing is sent to a server. If the download or GPU memory fails, the run falls back to the deterministic reasoner,
                  and you can select WebLLM again to retry.
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
        {runner.trace.length > 0 && !runner.result ? (
          <Section
            eyebrow="Agent trace"
            title="What happened, in order"
            right={`${runner.trace.length} events`}
          >
            <TraceViewer trace={runner.trace} />
          </Section>
        ) : null}

        {runner.status === "error" ? (
          <Card className="border-accent">
            <CardBody>
              <Eyebrow>Run failed</Eyebrow>
              <p className="mt-2 text-sm">{runner.error}</p>
            </CardBody>
          </Card>
        ) : null}

        {/* Results */}
        {runner.result ? <Results result={runner.result} trace={runner.trace} /> : null}
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
        (active ? "bg-accent text-on-accent" : "bg-paper text-ink hover:bg-subtle")
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

function Results({
  result,
  trace,
}: {
  result: import("@/core/orchestrator/types").OrchestrationResult;
  trace: import("@/core/orchestrator/types").TraceEvent[];
}) {
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

  const comparison = (
    <>
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
      <Card className="mb-6">
        <CardHeader title="How often is each model right?" eyebrow="Direction of the next hour, on data the models never saw" />
        <CardBody>
          <AccuracyBars
            models={result.record.models.map((m) => ({
              label: modelLabel(m.modelType),
              accuracy: m.metrics.accuracy,
              best: m.modelId === result.record.bestModelId,
            }))}
          />
        </CardBody>
      </Card>
      <MetricsTable
        models={result.record.models}
        bestModelId={result.record.bestModelId}
        baselineModelId={result.record.baselineModelId}
      />
      {best ? <BacktestContext model={best} /> : null}
    </>
  );

  const equityPanel = best ? (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Would it have made money?" eyebrow={`${modelLabel(best.modelType)} · growth of 1,000, after costs`} />
        <CardBody>
          <GrowthChart equity={equity} datasetId={result.record.dataset.datasetId} version={result.record.dataset.version} />
        </CardBody>
      </Card>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Month by month" eyebrow="Gain or loss in each month" />
          <CardBody>
            <MonthlyReturns equity={equity} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Worst dips" eyebrow="Distance below the previous high" />
          <CardBody>
            <DrawdownChart equity={equity} />
          </CardBody>
        </Card>
      </div>
    </div>
  ) : (
    <p className="text-sm text-muted">No model beat the baseline, so there is no strategy to chart.</p>
  );

  const report = (
    <>
      <div className="mb-4 flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => download(`${result.record.id}.md`, result.reportMarkdown, "text/markdown")}>
          Export Markdown
        </Button>
        <Button variant="secondary" onClick={() => download(`${result.record.id}.json`, JSON.stringify(result.record, null, 2), "application/json")}>
          Export JSON
        </Button>
      </div>
      <Card>
        <CardBody>
          <ReportView markdown={result.reportMarkdown} />
        </CardBody>
      </Card>
    </>
  );

  return (
    <Section eyebrow="Results" title="Run complete" right={`${result.reasoner} · seed ${result.seed}`}>
      <Tabs
        tabs={[
          { id: "comparison", label: "Model comparison", content: comparison },
          { id: "equity", label: "Performance", content: equityPanel },
          { id: "critic", label: "Critic findings", content: <CritiqueList critique={result.critique} /> },
          { id: "report", label: "Evidence report", content: report },
          { id: "trace", label: `Agent trace (${trace.length})`, content: <TraceViewer trace={trace} /> },
        ]}
      />
    </Section>
  );
}
