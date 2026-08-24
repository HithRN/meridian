"use client";

import { useState } from "react";
import { PageHeader, PageBody, Section } from "@/components/layout/PageHeader";
import { Card, CardHeader, CardBody, Button, Badge, Eyebrow } from "@/components/ui/primitives";

interface Step {
  id: string;
  agent: string;
  title: string;
  tool: string;
  input: unknown;
  output: unknown;
  ok: boolean;
}

async function callTool(name: string, input: unknown) {
  const res = await fetch(`/api/tool/${name}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  return res.json();
}

/** Build the corrected file: add a flat-baseline guard before the comparison. */
function patchFile(original: string): string {
  return original.replace(
    "  const f = sma(bars, fast, at);\n  const s = sma(bars, slow, at);\n  return f > s ? 1 : -1;",
    "  const f = sma(bars, fast, at);\n  const s = sma(bars, slow, at);\n  if (Number.isNaN(s)) return 0; // flat baseline during warmup\n  return f > s ? 1 : -1;",
  );
}

export default function CodingAgentPage() {
  const [steps, setSteps] = useState<Step[]>([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);

  const run = async () => {
    setRunning(true);
    setDone(false);
    setSteps([]);
    const push = (s: Step) => setSteps((prev) => [...prev, s]);

    // 1. Inspect repository (list).
    const list = await callTool("inspect_repo", {});
    push({ id: "list", agent: "coding-agent", title: "Inspect repository (list whitelisted files)", tool: "inspect_repo", input: {}, output: list.data, ok: list.ok });

    // 2. Read the target file.
    const target = "src/strategies/movingAverage.ts";
    const read = await callTool("inspect_repo", { path: target });
    push({ id: "read", agent: "coding-agent", title: `Read ${target}`, tool: "inspect_repo", input: { path: target }, output: read.data, ok: read.ok });

    // 3. Run tests before the change (baseline should fail).
    const before = await callTool("run_tests", {});
    push({ id: "before", agent: "coding-agent", title: "Run tests (before patch)", tool: "run_tests", input: {}, output: before.data, ok: before.ok });

    // 4. Propose a bounded patch.
    const original: string = read.data?.file?.contents ?? "";
    const proposedContents = patchFile(original);
    const patchInput = { path: target, proposedContents };
    const patch = await callTool("propose_patch", patchInput);
    push({ id: "patch", agent: "coding-agent", title: "Propose bounded patch", tool: "propose_patch", input: { path: target, proposedContents: "«full file»" }, output: patch.data, ok: patch.ok });

    // 5. Run tests against the patch (should pass).
    const after = await callTool("run_tests", { patch: patchInput });
    push({ id: "after", agent: "coding-agent", title: "Run tests (with patch)", tool: "run_tests", input: { patch: "«proposed»" }, output: after.data, ok: after.ok });

    setRunning(false);
    setDone(true);
  };

  const patchStep = steps.find((s) => s.id === "patch");
  const afterStep = steps.find((s) => s.id === "after");

  return (
    <>
      <PageHeader
        index="06"
        title="Coding agent"
        lede="A safe agentic-coding demonstration. The agent inspects a whitelisted in-memory repository, runs its tests, proposes a bounded patch, and re-runs the tests — with no shell, no network, and no write path to disk."
        actions={<Button onClick={run} disabled={running}>{running ? "Running…" : done ? "Run again" : "Run coding agent →"}</Button>}
      />
      <PageBody>
        <Section eyebrow="Task" title="Add a flat baseline signal">
          <Card>
            <CardBody className="space-y-2">
              <p className="text-muted">
                The moving-average crossover strategy returns <code>-1</code> during the warmup period
                before the slow SMA can be computed, causing spurious short positions. The agent must
                add a flat (<code>0</code>) baseline when the slow SMA is unavailable, and prove it
                with the sandbox test suite.
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <Badge variant="muted">whitelist only</Badge>
                <Badge variant="muted">no shell execution</Badge>
                <Badge variant="muted">no destructive ops</Badge>
                <Badge variant="muted">patch never written to disk</Badge>
              </div>
            </CardBody>
          </Card>
        </Section>

        {steps.length > 0 ? (
          <Section eyebrow="Execution" title="Agent steps">
            <div className="border border-line">
              {steps.map((s, i) => (
                <div key={s.id} className="border-b border-line last:border-b-0">
                  <div className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-baseline gap-3">
                      <span className="tnum text-[0.7rem] text-faint">{String(i + 1).padStart(2, "0")}</span>
                      <span className="text-sm">{s.title}</span>
                      <code className="text-[0.72rem] text-faint">{s.tool}</code>
                    </div>
                    <Badge variant={s.ok ? "outline" : "solid"}>{s.ok ? "ok" : "error"}</Badge>
                  </div>
                  <div className="grid grid-cols-1 gap-px border-t border-line bg-line md:grid-cols-2">
                    <Pane label="Input" value={s.input} />
                    <Pane label="Output" value={s.output} />
                  </div>
                </div>
              ))}
            </div>
          </Section>
        ) : null}

        {patchStep?.output ? (
          <Section eyebrow="Proposed change" title="Diff summary">
            <Card>
              <CardHeader
                title={(patchStep.output as { path: string }).path}
                eyebrow={`+${(patchStep.output as { added: number }).added} / −${(patchStep.output as { removed: number }).removed} lines`}
              />
              <CardBody>
                <pre className="overflow-x-auto whitespace-pre-wrap text-[0.82rem] leading-relaxed">
                  {(patchStep.output as { preview: string }).preview}
                </pre>
              </CardBody>
            </Card>
          </Section>
        ) : null}

        {done && afterStep?.output ? (
          <Section eyebrow="Result" title="Test outcome">
            <div className="border border-ink px-5 py-4">
              <Eyebrow>Summary</Eyebrow>
              <p className="mt-2 text-lg">
                {(afterStep.output as { allPassed: boolean }).allPassed
                  ? "All tests pass with the proposed patch. The agent reports the diff and stops — it does not apply the change to disk or deploy."
                  : "Tests still failing; the agent would iterate on a bounded correction."}
              </p>
              <p className="mt-2 tnum text-sm text-muted">
                {(afterStep.output as { passed: number }).passed}/{(afterStep.output as { total: number }).total} passing
              </p>
            </div>
          </Section>
        ) : null}
      </PageBody>
    </>
  );
}

function Pane({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="bg-paper px-4 py-3">
      <div className="eyebrow mb-1">{label}</div>
      <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words text-[0.74rem] leading-relaxed text-muted">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}
