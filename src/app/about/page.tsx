import type { Metadata } from "next";
import { PageHeader, PageBody } from "@/components/layout/PageHeader";
import { KeyValue, Card } from "@/components/ui/primitives";
import { Tabs } from "@/components/ui/Tabs";
import { listDatasets } from "@/core/data/dataset";
import { versionManifest } from "@/core/version";
import { WORKFLOW_STATES } from "@/core/orchestrator/states";
import { dateShort } from "@/lib/format";

export const metadata: Metadata = {
  title: "How it works",
  description: "Architecture, agents, guarantees, data provenance and safety posture of the Meridian platform.",
};

const AGENTS: Array<{ name: string; role: string; guard: string }> = [
  { name: "AI Copilot", role: "Claude chooses tools and explains results in English or Japanese.", guard: "Never states a number no tool produced." },
  { name: "Orchestrator", role: "Decomposes the task and enforces the workflow and structured context.", guard: "Never invents metrics or bypasses tools." },
  { name: "Data Agent", role: "Inspects schema, missingness, timestamp integrity and leakage risk.", guard: "Never modifies source data silently." },
  { name: "Research Agent", role: "Fixes the hypothesis, features, baselines and validation plan.", guard: "Never declares success before evaluation." },
  { name: "ML Agent", role: "Trains and evaluates approved models and records metrics.", guard: "Never changes the protocol without logging it." },
  { name: "Quant Agent", role: "Converts predictions to positions and runs cost-aware backtests.", guard: "Never uses future information." },
  { name: "Critic Agent", role: "Attempts to falsify results and expose methodological weakness.", guard: "Never silently changes results." },
  { name: "Reporter Agent", role: "Produces an evidence report strictly from tool outputs.", guard: "Never invents citations, metrics or experiments." },
  { name: "Coding Agent", role: "Inspects a sandbox repo, proposes a patch and runs tests.", guard: "Never runs destructive or production commands." },
];

const GUARANTEES: Array<{ k: string; v: string }> = [
  { k: "Deterministic metrics", v: "No number reaches a report or a copilot answer unless a tool produced it. The language model never computes results." },
  { k: "Calibrated, not asserted", v: "The tip advisor's coverage claim is measured out of sample with walk-forward validation, including in congested regimes." },
  { k: "Leakage-safe by construction", v: "Features use only information available at prediction time; walk-forward splits are embargoed; a scan flags future-derived columns." },
  { k: "Reproducible", v: "Every run pins dataset version, content hash, seed and kernel version. The same inputs yield byte-identical outputs." },
  { k: "MCP-compatible tools", v: "Tools are discovered by name with strict JSON Schemas and executed over a stateless HTTP layer, for agents and Claude alike." },
  { k: "Never breaks on stage", v: "Live Jito data degrades to bundled snapshots; Claude degrades to a deterministic engine. Every path is labelled." },
];

const LAYERS: Array<[string, string, string]> = [
  ["Interface", "Next.js · TypeScript", "Jito Lab, copilot, research workspace, reports"],
  ["Machine learning", "Logistic · boosted trees · MLP (from scratch)", "Bundle-landing prediction, trained and evaluated in TypeScript"],
  ["Explainability", "Exact Shapley · PDP · counterfactuals", "Why a prediction was made, verified against ground truth"],
  ["LLM", "Claude (tool use) · WebLLM", "Copilot reasoning and tool selection; browser-local planning"],
  ["Fallback", "Deterministic policies", "Bilingual intent router and rule-based planner — zero cost"],
  ["Network data", "Jito public APIs", "Tip floor and stake-pool stats, cached, with bundled fallback"],
  ["Orchestration", "Typed state machine", "Planner → workers → critic → reporter"],
  ["Tools", "MCP-compatible schemas", "Strictly typed, audited execution"],
  ["Compute", "Route handlers · Web Workers", "Conformal forecasting, ML, backtest and profiling kernels"],
];

export default function AboutPage() {
  const datasets = listDatasets(true);
  const versions = versionManifest();

  const principles = (
    <div className="max-w-3xl space-y-4 text-muted prose-serif">
      <p>
        Meridian separates <em>reasoning</em> from <em>computation</em>. A reasoning layer — Claude in the
        copilot, a browser-local model in the research workspace, or a transparent deterministic policy —
        decides what to investigate and explains the outcome. It never produces a metric, a tip, a yield or a
        p-value. Those come exclusively from tools that are validated on the way in and out and logged in an
        audit trail.
      </p>
      <p>
        That boundary is what makes the AI trustworthy for money-adjacent questions: you can always click
        through from a sentence in an answer to the tool call, its inputs and its output.
      </p>
    </div>
  );

  const workflow = (
    <>
      <p className="mb-6 max-w-3xl text-muted">
        Every research session advances through the same nine states. Each transition is persisted in the
        trace, so a reviewer can see exactly what happened — and the reporter cannot mark an experiment complete
        until the critic has run.
      </p>
      <ol className="grid grid-cols-1 gap-px border border-line bg-line sm:grid-cols-3 lg:grid-cols-9">
        {WORKFLOW_STATES.map((s, i) => (
          <li key={s} className="bg-paper px-3 py-4">
            <div className="tnum text-[0.68rem] text-faint">{String(i + 1).padStart(2, "0")}</div>
            <div className="mt-2 text-[0.82rem] leading-tight">{s.replace(/_/g, " ")}</div>
          </li>
        ))}
      </ol>
    </>
  );

  const agents = (
    <div className="grid grid-cols-1 gap-px border border-line bg-line md:grid-cols-2">
      {AGENTS.map((a) => (
        <div key={a.name} className="bg-paper px-5 py-5">
          <h3 className="text-lg">{a.name}</h3>
          <p className="mt-1 text-sm text-muted">{a.role}</p>
          <p className="mt-3 text-[0.8rem] uppercase tracking-[0.1em] text-faint">Must not — {a.guard}</p>
        </div>
      ))}
    </div>
  );

  const guarantees = (
    <div className="grid grid-cols-1 gap-px border border-line bg-line md:grid-cols-3">
      {GUARANTEES.map((g) => (
        <Card key={g.k} className="border-0 bg-paper px-5 py-5">
          <h3 className="text-base">{g.k}</h3>
          <p className="mt-2 text-sm text-muted">{g.v}</p>
        </Card>
      ))}
    </div>
  );

  const architecture = (
    <div className="overflow-x-auto border border-line">
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-ink">
            {["Layer", "Technology", "Purpose"].map((h) => (
              <th key={h} className="px-4 py-3 font-normal uppercase tracking-[0.12em] text-faint">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {LAYERS.map(([layer, tech, purpose]) => (
            <tr key={layer} className="border-b border-line last:border-b-0">
              <td className="px-4 py-3">{layer}</td>
              <td className="px-4 py-3 text-muted">{tech}</td>
              <td className="px-4 py-3 text-muted">{purpose}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const data = (
    <>
      <p className="mb-4 max-w-3xl text-muted">
        Network figures (tip floor, JitoSOL APY, TVL, MEV rewards) come live from Jito&rsquo;s public APIs, with
        bundled snapshots as a fallback. Research datasets and the tip advisor&rsquo;s calibration history are
        synthetic, generated from fixed seeds, so every result is reproducible and carries a content hash.
      </p>
      <div className="overflow-x-auto border border-line">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-ink">
              {["Dataset", "Symbol", "Rows", "Span", "Content hash", "Role"].map((h) => (
                <th key={h} className="px-4 py-3 font-normal uppercase tracking-[0.12em] text-faint">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {datasets.map((d) => (
              <tr key={d.id} className="border-b border-line last:border-b-0">
                <td className="px-4 py-3">{d.name}</td>
                <td className="px-4 py-3 text-muted">{d.symbol}</td>
                <td className="px-4 py-3 tnum text-muted">{d.rows}</td>
                <td className="px-4 py-3 tnum text-muted">{dateShort(d.start)} → {dateShort(d.end)}</td>
                <td className="px-4 py-3 tnum text-muted">{d.contentHash.slice(0, 12)}</td>
                <td className="px-4 py-3 text-muted">{d.leakageFixture ? "Leakage fixture" : "Research"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );

  const safety = (
    <div className="grid grid-cols-1 gap-10 md:grid-cols-2">
      <div>
        <h3 className="mb-3 text-lg">What the demo will not do</h3>
        <ul className="space-y-3 text-sm text-muted">
          <li>— No wallets, signing, order routing or bundle submission. Network access is read-only.</li>
          <li>— The copilot gives analysis, not investment advice, and refuses to recommend buying or selling.</li>
          <li>— Tool inputs are schema-validated; unknown parameters are rejected and compute is bounded.</li>
          <li>— The coding agent works on an in-memory sandbox with no shell, network or disk writes.</li>
        </ul>
      </div>
      <div>
        <h3 className="mb-3 text-lg">Honest boundaries</h3>
        <ul className="space-y-3 text-sm text-muted">
          <li>— The tip advisor&rsquo;s residuals are calibrated on synthetic history; on mainnet it should be recalibrated on a recorded tip-floor feed.</li>
          <li>— &ldquo;Outbid p95&rdquo; is relative to the landed-tip distribution, not a guarantee that a bundle lands.</li>
          <li>— The MEV share of APY is an estimate: reported MEV rewards ÷ TVL, annualised.</li>
          <li>— Research models are compact TypeScript learners; backtests omit market impact and liquidity limits.</li>
        </ul>
      </div>
    </div>
  );

  const build = (
    <div className="max-w-lg">
      <KeyValue k="Platform" v={<code>{versions.platform}</code>} />
      <KeyValue k="Tool runtime" v={<code>{versions.toolRuntime}</code>} />
      <KeyValue k="Experiment schema" v={<code>{versions.experimentSchema}</code>} />
      <KeyValue k="Numerical kernel" v={<code>{versions.kernel}</code>} />
      <KeyValue k="Git commit" v={<code>{versions.gitCommit}</code>} />
    </div>
  );

  return (
    <>
      <PageHeader
        index="10"
        title="How it works"
        lede="The agents, the guardrails, where the data comes from — and what the platform deliberately refuses to do."
      />
      <PageBody>
        <Tabs
          tabs={[
            { id: "principles", label: "Principles", content: principles },
            { id: "agents", label: "Agents", content: agents },
            { id: "workflow", label: "Workflow", content: workflow },
            { id: "guarantees", label: "Guarantees", content: guarantees },
            { id: "architecture", label: "Architecture", content: architecture },
            { id: "data", label: "Data", content: data },
            { id: "safety", label: "Safety & limits", content: safety },
            { id: "versions", label: "Versions", content: build },
          ]}
        />
      </PageBody>
    </>
  );
}
