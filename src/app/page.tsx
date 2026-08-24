import Link from "next/link";
import { PageBody, Section } from "@/components/layout/PageHeader";
import { Eyebrow, Badge, Button, Card } from "@/components/ui/primitives";
import { WORKFLOW_STATES } from "@/core/orchestrator/states";

const AGENTS: Array<{ name: string; role: string; guard: string }> = [
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
  { k: "Deterministic metrics", v: "No number reaches a report unless a deterministic tool produced it. The reasoning layer never computes results." },
  { k: "Leakage-safe by construction", v: "Features use only information available at prediction time; walk-forward splits are embargoed; a scan flags future-derived columns." },
  { k: "Reproducible", v: "Every run pins dataset version, content hash, seed and kernel version. The same inputs yield byte-identical outputs." },
  { k: "MCP-compatible tools", v: "Tools are discovered by name with strict JSON Schemas and executed over a stateless HTTP layer." },
  { k: "Auditable & replayable", v: "Every tool call is logged with agent id, input hash and output summary; the whole trace replays from recorded inputs." },
  { k: "Zero cost", v: "Browser-local inference where WebGPU is available, a deterministic fallback everywhere else. No paid model or data APIs." },
];

const LAYERS: Array<[string, string, string]> = [
  ["Interface", "Next.js · TypeScript", "Research workspace, agent trace, comparison, reports"],
  ["Reasoning", "WebLLM / WebGPU + fallback", "Browser-local planning; deterministic policy when unsupported"],
  ["Orchestration", "Typed state machine", "Planner → workers → critic → reporter"],
  ["Tools", "MCP-compatible schemas", "Strictly typed, audited, deterministic execution"],
  ["Compute", "Route handlers · Web Workers", "Bounded ML, backtest and profiling kernels"],
  ["MLOps", "JSON experiment store", "Versioned records, evaluation, drift & health"],
];

export default function OverviewPage() {
  return (
    <>
      {/* Hero */}
      <header className="border-b border-ink px-6 pb-10 pt-12 md:px-10 md:pt-20">
        <div className="mx-auto max-w-6xl">
          <Eyebrow>00 — Multi-Agent Quant Research &amp; ML Operations</Eyebrow>
          <h1 className="mt-4 max-w-4xl text-5xl leading-[1.02] tracking-tight md:text-7xl">
            Auditable research, decided by agents and proven by tools.
          </h1>
          <p className="mt-6 max-w-2xl text-xl text-muted">
            Meridian decomposes a research question into a plan, delegates it to specialised
            agents, and lets them investigate a quantitative hypothesis through deterministic,
            MCP-compatible tools — leakage-safe experiments, cost-aware backtests, an adversarial
            critique, and a report where every number is traceable to a tool call.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/research"><Button>Start a research run →</Button></Link>
            <Link href="/tools"><Button variant="secondary">Inspect the tools</Button></Link>
            <div className="ml-2 flex items-center gap-2">
              <Badge variant="muted">$0 stack</Badge>
              <Badge variant="muted">No API keys</Badge>
              <Badge variant="muted">Synthetic data</Badge>
            </div>
          </div>
        </div>
      </header>

      <PageBody>
        {/* Workflow */}
        <Section eyebrow="The workflow" title="A fixed, inspectable state machine">
          <p className="mb-6 max-w-3xl text-muted">
            Every session advances through the same nine states. Each transition is persisted in the
            session trace, so a reviewer can see exactly what happened and in what order — and the
            reporter cannot mark an experiment complete until the critic has run.
          </p>
          <ol className="grid grid-cols-1 gap-px border border-line bg-line sm:grid-cols-3 lg:grid-cols-9">
            {WORKFLOW_STATES.map((s, i) => (
              <li key={s} className="bg-paper px-3 py-4">
                <div className="tnum text-[0.68rem] text-faint">{String(i + 1).padStart(2, "0")}</div>
                <div className="mt-2 text-[0.82rem] leading-tight">{s.replace(/_/g, " ")}</div>
              </li>
            ))}
          </ol>
        </Section>

        {/* Agents */}
        <Section eyebrow="Specialised agents" title="Seven roles, one coordinator, hard boundaries">
          <div className="grid grid-cols-1 gap-px border border-line bg-line md:grid-cols-2">
            {AGENTS.map((a) => (
              <div key={a.name} className="bg-paper px-5 py-5">
                <div className="flex items-baseline justify-between">
                  <h3 className="text-lg">{a.name}</h3>
                </div>
                <p className="mt-1 text-sm text-muted">{a.role}</p>
                <p className="mt-3 text-[0.8rem] uppercase tracking-[0.1em] text-faint">
                  Must not — {a.guard}
                </p>
              </div>
            ))}
          </div>
        </Section>

        {/* Guarantees */}
        <Section eyebrow="Guarantees" title="What the design refuses to compromise">
          <div className="grid grid-cols-1 gap-px border border-line bg-line md:grid-cols-3">
            {GUARANTEES.map((g) => (
              <Card key={g.k} className="border-0 bg-paper px-5 py-5">
                <h3 className="text-base">{g.k}</h3>
                <p className="mt-2 text-sm text-muted">{g.v}</p>
              </Card>
            ))}
          </div>
        </Section>

        {/* Architecture */}
        <Section eyebrow="Architecture" title="Zero-cost, serverless, browser-forward">
          <div className="overflow-x-auto border border-line">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-ink">
                  <th className="px-4 py-3 font-normal uppercase tracking-[0.12em] text-faint">Layer</th>
                  <th className="px-4 py-3 font-normal uppercase tracking-[0.12em] text-faint">Technology</th>
                  <th className="px-4 py-3 font-normal uppercase tracking-[0.12em] text-faint">Purpose</th>
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
          <p className="mt-6 max-w-3xl text-sm text-muted">
            All results shown across the platform are computed on bundled synthetic market data for
            demonstration only. Nothing here is investment advice or evidence about any real market.
          </p>
        </Section>
      </PageBody>
    </>
  );
}
