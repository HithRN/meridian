"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PageHeader, PageBody, Section } from "@/components/layout/PageHeader";
import { Badge, Card, CardBody, CardHeader, Eyebrow, KeyValue } from "@/components/ui/primitives";
import { Tabs } from "@/components/ui/Tabs";
import { MultiLineChart, ReliabilityChart, SERIES_STYLE } from "@/components/charts/AiCharts";
import { ProbabilityGauge, TipResponseCurve } from "@/components/charts/PlainCharts";
import { FEATURES, SCENARIOS, TIP_FEATURE } from "@/core/ai/bundles";
import { MODEL_IDS, MODEL_NAMES, logit, type ModelId } from "@/core/ai/models";
import { minTipForTarget, shapExact } from "@/core/ai/explain";
import type { LabReport } from "@/core/ai/lab";
import { sigmoid } from "@/core/ml/stats";
import { cn } from "@/lib/cn";

const pct = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`;

export default function ExplainableAiPage() {
  const [lab, setLab] = useState<LabReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [p50Sol, setP50Sol] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/ai")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: LabReport) => setLab(j))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
    fetch("/api/jito")
      .then((r) => r.json())
      .then((j) => setP50Sol(j.tipFloor?.data?.p50 ?? null))
      .catch(() => setP50Sol(null));
  }, []);

  return (
    <>
      <PageHeader
        eyebrow="Solana · Jito" accent="var(--color-mod-agents)"
        title="Explainable AI"
        lede="Will this bundle land, and why? Three models trained from scratch on a Jito bundle-auction simulator, explained with exact Shapley values, partial dependence and counterfactual tips, then checked against the true mechanism."
        actions={lab ? <Badge variant="muted">Trained in {(lab.builtMs / 1000).toFixed(1)}s</Badge> : null}
      />
      <PageBody>
        {error ? (
          <div className="border border-accent px-4 py-3 text-sm">Could not load the AI lab: {error}</div>
        ) : !lab ? (
          <Card>
            <CardBody>
              <Eyebrow>Training</Eyebrow>
              <p className="mt-2">Simulating 8,000 bundles, training logistic regression, boosted trees and a neural network, computing exact Shapley values…</p>
              <div className="mt-3 h-[3px] w-full overflow-hidden bg-line">
                <div className="h-full w-1/3 animate-pulse bg-ink" />
              </div>
            </CardBody>
          </Card>
        ) : (
          <Tabs
            tabs={[
              { id: "explain", label: "Predict & explain", content: <ExplainTab lab={lab} p50Sol={p50Sol} /> },
              { id: "models", label: "Model leaderboard", content: <ModelsTab lab={lab} /> },
              { id: "global", label: "Global explanations", content: <GlobalTab lab={lab} /> },
              { id: "method", label: "Method & roadmap", content: <MethodTab lab={lab} /> },
            ]}
          />
        )}
      </PageBody>
    </>
  );
}

/* --------------------------------------------------------- predict & explain */

function ExplainTab({ lab, p50Sol }: { lab: LabReport; p50Sol: number | null }) {
  const [modelId, setModelId] = useState<ModelId>("gbt");
  const [x, setX] = useState<number[]>(SCENARIOS[1].x);
  const [scenario, setScenario] = useState(SCENARIOS[1].id);
  const [target, setTarget] = useState(0.9);

  const f = useMemo(() => {
    const m = lab.models[modelId];
    return (z: number[]) => logit(m, z);
  }, [lab, modelId]);
  const exp = useMemo(() => shapExact(f, x, lab.background), [f, x, lab.background]);
  const minTip = useMemo(() => minTipForTarget(f, x, target), [f, x, target]);
  const tipCurve = useMemo(
    () =>
      Array.from({ length: 46 }, (_, i) => -2 + i * 0.18).map((v) => {
        const z = [...x];
        z[TIP_FEATURE] = v;
        return { multiple: Math.pow(2, v), p: sigmoid(f(z)) * 100 };
      }),
    [f, x],
  );
  const prob = sigmoid(exp.value);
  const base = sigmoid(exp.base);

  const order = FEATURES.map((_, j) => j).sort((a, b) => Math.abs(exp.phi[b]) - Math.abs(exp.phi[a]));
  const maxAbs = Math.max(...exp.phi.map(Math.abs), 0.01);
  const up = order.filter((j) => exp.phi[j] > 0.05).slice(0, 2);
  const down = order.filter((j) => exp.phi[j] < -0.05).slice(0, 2);
  const blockers = order.filter((j) => j !== TIP_FEATURE && exp.phi[j] < 0).slice(0, 2);

  const setFeature = (j: number, v: number) => {
    setX((cur) => cur.map((c, i) => (i === j ? v : c)));
    setScenario("");
  };

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <Eyebrow>Scenario</Eyebrow>
        <div className="flex flex-wrap gap-2">
          {SCENARIOS.map((s) => (
            <button
              key={s.id}
              onClick={() => {
                setX(s.x);
                setScenario(s.id);
              }}
              className={cn("border px-3 py-1 text-[0.8rem]", scenario === s.id ? "border-accent bg-accent text-on-accent" : "border-line text-muted hover:border-accent hover:text-ink")}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader title="Bundle features" eyebrow="What the searcher knows at submission" />
          <CardBody className="space-y-4">
            {FEATURES.map((spec, j) => (
              <div key={spec.key}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm" title={spec.description}>{spec.label}</span>
                  <span className="tnum text-sm">
                    {j === TIP_FEATURE ? `×${Math.pow(2, x[j]).toFixed(2)}` : x[j]}
                  </span>
                </div>
                <input
                  type="range"
                  min={spec.min}
                  max={spec.max}
                  step={spec.step}
                  value={x[j]}
                  onChange={(e) => setFeature(j, Number(e.target.value))}
                  className="w-full"
                  aria-label={spec.label}
                />
              </div>
            ))}
          </CardBody>
        </Card>

        <div className="space-y-6 lg:col-span-3">
          <Card className="border-accent">
            <CardHeader
              title="Landing probability"
              eyebrow="Prediction"
              right={
                <div className="flex border border-accent">
                  {MODEL_IDS.map((id) => (
                    <button key={id} onClick={() => setModelId(id)} className={cn("px-2 py-[3px] text-[0.75rem]", modelId === id ? "bg-accent text-on-accent" : "hover:bg-subtle")}>
                      {id === "gbt" ? "Trees" : id === "mlp" ? "Neural net" : "Logistic"}
                    </button>
                  ))}
                </div>
              }
            />
            <CardBody>
              <div className="flex flex-wrap items-center gap-x-8 gap-y-2">
                <ProbabilityGauge p={prob} label="Landing probability" />
                <div className="text-[0.95rem] text-muted">
                  Chance this bundle lands
                  <div className="mt-1 text-[0.85rem] text-faint">
                    An average bundle: {pct(base, 0)} · {MODEL_NAMES[modelId]}
                  </div>
                </div>
              </div>
              <p className="mt-4 text-[0.95rem]">
                {up.length ? <>Pushing it up: <strong>{up.map((j) => FEATURES[j].short).join(", ")}</strong>. </> : null}
                {down.length ? <>Holding it back: <strong>{down.map((j) => FEATURES[j].short).join(", ")}</strong>.</> : null}
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Why: exact Shapley values" eyebrow="Contribution to log-odds, relative to the average bundle" />
            <CardBody>
              <div className="space-y-[6px]">
                {order.map((j) => {
                  const v = exp.phi[j];
                  const w = (Math.abs(v) / maxAbs) * 50;
                  return (
                    <div key={j} className="grid grid-cols-[9rem_1fr_3.5rem] items-center gap-3 text-sm">
                      <span className="truncate text-muted" title={FEATURES[j].label}>{FEATURES[j].short}</span>
                      <div className="relative h-[14px] bg-subtle">
                        <div className="absolute inset-y-0 left-1/2 w-px bg-line-strong" />
                        <div
                          className="absolute inset-y-[2px] rounded-sm"
                          style={{
                            background: v >= 0 ? "var(--color-chart-positive)" : "var(--color-chart-negative)",
                            ...(v >= 0 ? { left: "50%", width: `${w}%` } : { right: "50%", width: `${w}%` }),
                          }}
                        />
                      </div>
                      <span className={cn("tnum text-right", v >= 0 ? "text-positive" : "text-negative")}>{v >= 0 ? "+" : ""}{v.toFixed(2)}</span>
                    </div>
                  );
                })}
              </div>
              <p className="mt-4 text-[0.78rem] text-faint">
                Green bars push toward landing, red bars away. Base {exp.base.toFixed(2)} + Σφ {exp.phi.reduce((a, b) => a + b, 0).toFixed(2)} ={" "}
                {exp.value.toFixed(2)} log-odds = {pct(prob)}. Exact, computed over all 256 feature coalitions.
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="What would change the outcome?" eyebrow="Counterfactual recourse" />
            <CardBody>
              <div className="flex items-baseline justify-between">
                <Eyebrow>Target landing probability</Eyebrow>
                <span className="tnum text-sm">{pct(target, 0)}</span>
              </div>
              <input type="range" min={50} max={99} value={Math.round(target * 100)} onChange={(e) => setTarget(Number(e.target.value) / 100)} className="mt-1 w-full" aria-label="Target probability" />
              <div className="mt-4">
                {minTip === null ? (
                  <p>
                    <strong>No tip in range reaches {pct(target, 0)}.</strong>{" "}
                    <span className="text-muted">
                      The bottleneck isn&rsquo;t the tip, it&rsquo;s {blockers.map((j) => FEATURES[j].short.toLowerCase()).join(" and ") || "the rest of the bundle"}.
                      Change those (for example, fresher state, a smaller bundle, or a less contended route) before paying more.
                    </span>
                  </p>
                ) : minTip <= x[TIP_FEATURE] ? (
                  <p>
                    <strong>Already there.</strong>{" "}
                    <span className="text-muted">
                      A tip of ×{Math.pow(2, minTip).toFixed(2)} p50 would suffice. You could cut the tip by{" "}
                      {pct(1 - Math.pow(2, minTip - x[TIP_FEATURE]), 0)} and keep a {pct(target, 0)} landing probability.
                    </span>
                  </p>
                ) : (
                  <p>
                    <strong>Raise the tip to ×{Math.pow(2, minTip).toFixed(2)} the landed p50</strong>
                    {p50Sol ? <> (≈ {Math.round(Math.pow(2, minTip) * p50Sol * 1e9).toLocaleString("en-US")} lamports at today&rsquo;s live p50)</> : null}
                    <span className="text-muted">, everything else unchanged.</span>
                  </p>
                )}
              </div>
              <div className="mt-5">
                <TipResponseCurve
                  points={tipCurve}
                  currentTip={Math.pow(2, x[TIP_FEATURE])}
                  target={target}
                  minTip={minTip === null ? null : Math.pow(2, minTip)}
                />
              </div>
              <p className="mt-3 text-[0.78rem] text-faint">
                Want this in words, or in Japanese? <Link href="/copilot" className="underline underline-offset-2">Ask the copilot</Link>. It calls the same
                model through the <code>predict_bundle_landing</code> tool.
              </p>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------- leaderboard */

function ModelsTab({ lab }: { lab: LabReport }) {
  const rows: Array<ModelId | "oracle"> = [...MODEL_IDS, "oracle"];
  const gap = (id: ModelId) => {
    const lo = lab.metrics.logistic.logLoss, hi = lab.metrics.oracle.logLoss;
    return (lo - lab.metrics[id].logLoss) / (lo - hi);
  };
  return (
    <>
      <Section eyebrow={`Held-out test set · ${lab.split.test.toLocaleString("en-US")} bundles`} title="How good are the models?">
        <div className="overflow-x-auto border border-line">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-line-strong">
                {["Model", "AUC", "Log loss", "Brier", "Accuracy", "ECE", "Gap to oracle closed"].map((h) => (
                  <th key={h} className="px-4 py-3 font-normal text-[0.68rem] text-faint">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((id) => {
                const m = lab.metrics[id];
                return (
                  <tr key={id} className={cn("border-b border-line last:border-b-0", id === "oracle" && "bg-subtle")}>
                    <td className="px-4 py-3">{id === "oracle" ? "Oracle (true probabilities)" : MODEL_NAMES[id]}</td>
                    <td className="px-4 py-3 tnum">{m.auc.toFixed(3)}</td>
                    <td className="px-4 py-3 tnum">{m.logLoss.toFixed(3)}</td>
                    <td className="px-4 py-3 tnum">{m.brier.toFixed(3)}</td>
                    <td className="px-4 py-3 tnum">{pct(m.accuracy)}</td>
                    <td className="px-4 py-3 tnum">{pct(m.ece)}</td>
                    <td className="px-4 py-3 tnum text-muted">{id === "oracle" ? "n/a" : id === "logistic" ? "baseline" : pct(gap(id), 0)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 max-w-3xl text-sm text-muted">
          The oracle scores the true probabilities, so it is the best any model can do: landing is inherently random. Non-linear models capture the
          saturating auction and the daily cycle that a linear model cannot.
        </p>
      </Section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Calibration" eyebrow="Does 70% mean 70%?" />
          <CardBody>
            <ReliabilityChart bins={{ gbt: lab.metrics.gbt.reliability, mlp: lab.metrics.mlp.reliability, logistic: lab.metrics.logistic.reliability }} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Training" eyebrow="Validation loss with early stopping" />
          <CardBody className="space-y-5">
            {(["gbt", "mlp"] as const).map((id) => {
              const t = lab.training[id];
              return (
                <div key={id}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span>{MODEL_NAMES[id]}</span>
                    <span className="tnum text-faint">
                      kept {t.bestStep} {id === "gbt" ? "trees" : "epochs"} · {t.ms} ms
                    </span>
                  </div>
                  <MultiLineChart
                    x={t.curve.map((c) => c.step)}
                    series={{ train: t.curve.map((c) => c.train), valid: t.curve.map((c) => c.valid) }}
                    xLabel={(v) => String(v)}
                    yDomain={["auto", "auto"]}
                    yFormat={(v) => v.toFixed(3)}
                    height={130}
                  />
                </div>
              );
            })}
          </CardBody>
        </Card>
      </div>
    </>
  );
}

/* --------------------------------------------------------------- global */

function GlobalTab({ lab }: { lab: LabReport }) {
  const keys = ["truth", ...MODEL_IDS] as const;
  const max = Math.max(...keys.flatMap((k) => lab.importance[k]));
  const order = FEATURES.map((_, j) => j).sort((a, b) => lab.importance.truth[b] - lab.importance.truth[a]);
  return (
    <>
      <Section eyebrow="Faithfulness" title="Are the explanations right?">
        <p className="mb-4 max-w-3xl text-sm text-muted">
          On real data you can never check an explanation. Here the true mechanism is known, so each model&rsquo;s Shapley values are compared
          with the ground truth&rsquo;s Shapley values on the same bundles.
        </p>
        <div className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-line bg-line md:grid-cols-3">
          {MODEL_IDS.map((id) => {
            const fa = lab.faithfulness[id];
            return (
              <div key={id} className="bg-paper px-5 py-5">
                <Eyebrow>{MODEL_NAMES[id]}</Eyebrow>
                <div className="tnum mt-2 text-3xl leading-none">{fa.localCosine.toFixed(3)}</div>
                <div className="mt-1 text-[0.78rem] text-muted">mean per-bundle cosine similarity</div>
                <div className="mt-3">
                  <KeyValue k="Global importance cosine" v={<span className="tnum">{fa.globalCosine.toFixed(3)}</span>} />
                  <KeyValue k="Top-3 drivers matched" v={<span className="tnum">{Math.round(fa.top3Overlap * 3)} / 3</span>} />
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      <Section eyebrow="Mean |Shapley value|" title="What drives landing, by model">
        <div className="space-y-3">
          {order.map((j) => (
            <div key={j} className="grid grid-cols-[9rem_1fr] items-center gap-3 text-sm">
              <span className="text-muted">{FEATURES[j].short}</span>
              <div className="space-y-[2px]">
                {keys.map((k) => (
                  <div key={k} className="flex items-center gap-2">
                    <div
                      className="h-[7px] rounded-sm"
                      style={{ width: `${(lab.importance[k][j] / max) * 85}%`, background: SERIES_STYLE[k].stroke }}
                    />
                    <span className="tnum text-[0.68rem] text-faint">{lab.importance[k][j].toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-[0.75rem] text-muted">
          {keys.map((k) => (
            <span key={k} className="inline-flex items-center gap-2">
              <span className="h-[8px] w-[14px] rounded-sm" style={{ background: SERIES_STYLE[k].stroke }} />
              {SERIES_STYLE[k].label}
            </span>
          ))}
        </div>
        <p className="mt-3 max-w-3xl text-[0.8rem] text-faint">
          Note the hour-of-day row: its true effect is cyclical, so a linear model nearly ignores it, while trees and the network recover it.
        </p>
      </Section>

      <Section eyebrow="Partial dependence" title="How each model responds to a feature">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {lab.pdp.map((p) => (
            <Card key={p.feature}>
              <CardHeader title={FEATURES[p.feature].label} eyebrow="Average landing probability" />
              <CardBody>
                <MultiLineChart
                  x={p.grid}
                  series={{ truth: p.curves.truth, gbt: p.curves.gbt, mlp: p.curves.mlp, logistic: p.curves.logistic }}
                  xLabel={(v) => (p.feature === TIP_FEATURE ? `×${Math.pow(2, v).toFixed(v < 0 ? 2 : 0)}` : String(Math.round(v * 100) / 100))}
                  height={200}
                />
              </CardBody>
            </Card>
          ))}
        </div>
      </Section>
    </>
  );
}

/* --------------------------------------------------------------- method */

function MethodTab({ lab }: { lab: LabReport }) {
  return (
    <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
      <div className="space-y-6">
        <div>
          <h3 className="mb-2 text-lg">Data</h3>
          <p className="text-sm text-muted">
            {(lab.split.train + lab.split.valid + lab.split.test).toLocaleString("en-US")} bundles from a seeded auction simulator (hash{" "}
            <code>{lab.datasetHash}</code>), split {lab.split.train.toLocaleString("en-US")} / {lab.split.valid.toLocaleString("en-US")} /{" "}
            {lab.split.test.toLocaleString("en-US")} into train / validation / test. Base landing rate {pct(lab.split.baseRate)}. Landing log-odds come from a
            saturating bid-edge term (tip vs. congestion and competing bundles), an atomic revert risk growing with state drift and bundle size, the wait
            for a Jito leader, block packing pressure and a daily cycle.
          </p>
        </div>
        <div>
          <h3 className="mb-2 text-lg">Models written from scratch, without ML libraries</h3>
          <ul className="list-disc space-y-2 pl-5 text-sm text-muted marker:text-faint">
            <li><strong className="text-ink">Logistic regression</strong>: standardised inputs, L2, full-batch gradient descent.</li>
            <li><strong className="text-ink">Gradient-boosted trees</strong>: Newton leaf values, 32-bin histogram splits, depth 3, early stopping at {lab.training.gbt.bestStep} trees.</li>
            <li><strong className="text-ink">Neural network</strong>: 8 → 24 ReLU → 1, He initialisation, Adam, mini-batches of 64, weight decay, early stopping at epoch {lab.training.mlp.bestStep}.</li>
          </ul>
        </div>
        <div>
          <h3 className="mb-2 text-lg">Explainability</h3>
          <ul className="list-disc space-y-2 pl-5 text-sm text-muted marker:text-faint">
            <li><strong className="text-ink">Exact interventional Shapley values</strong>: all 2⁸ = 256 coalitions against a {lab.background.length}-bundle background. No sampling error; efficiency holds exactly.</li>
            <li><strong className="text-ink">Partial dependence</strong> with the true response curve overlaid.</li>
            <li><strong className="text-ink">Counterfactual recourse</strong>: the minimal tip change that reaches a target probability.</li>
            <li><strong className="text-ink">Calibration</strong>: reliability diagrams and expected calibration error.</li>
            <li><strong className="text-ink">Faithfulness</strong>: explanations scored against the known mechanism.</li>
            <li><strong className="text-ink">LLM narration</strong>: the copilot turns Shapley values into plain English or Japanese, without inventing numbers.</li>
          </ul>
        </div>
      </div>
      <div className="space-y-6">
        <Card className="border-accent">
          <CardHeader title="Taking it to mainnet" eyebrow="What this could become with Jito data" />
          <CardBody>
            <ol className="list-decimal space-y-3 pl-5 text-sm text-muted">
              <li><strong className="text-ink">Train on real outcomes.</strong> The block engine knows which bundles landed, were outbid, or failed simulation. The same pipeline trains on those labels in place of the simulator.</li>
              <li><strong className="text-ink">Explain drops to searchers.</strong> &ldquo;Your bundle missed because of state drift, not the tip&rdquo; saves searchers from overpaying, and validators and stakers still benefit from accurate bids.</li>
              <li><strong className="text-ink">Tip recommendations in the SDK.</strong> Serve the counterfactual tip as an API next to the tip floor, with calibrated confidence.</li>
              <li><strong className="text-ink">Monitor MEV health.</strong> Apply the same explainable models to bundle flow, for example to flag sandwich-like patterns with a reason attached, in support of Jito&rsquo;s anti-sandwich stance.</li>
              <li><strong className="text-ink">Community education.</strong> Bilingual, explainable tooling for JET Asia and Superteam Japan builders.</li>
            </ol>
          </CardBody>
        </Card>
        <p className="text-[0.8rem] text-faint">
          Limitation: these models are trained on a simulator, not mainnet data. The results show that the method works and that its
          explanations can be checked. Accuracy on real bundles depends on retraining with block-engine outcomes.
        </p>
      </div>
    </div>
  );
}
