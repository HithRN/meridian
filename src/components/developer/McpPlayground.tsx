"use client";

import { useEffect, useState } from "react";
import { Button, Eyebrow } from "@/components/ui/primitives";

const EXAMPLES: Record<string, unknown> = {
  list_datasets: {},
  jito_tip_floor: {},
  recommend_bundle_tip: { level: 95, confidence: 0.9 },
  predict_bundle_landing: { tipMultiple: 2, contention: 20, congestion: 0.9 },
  jitosol_stats: {},
  project_jitosol_yield: { amountSol: 100, days: 365 },
  profile_dataset: { datasetId: "synthetic-sol-hourly" },
  run_quant_research: { question: "Test a 24-period momentum signal on SOL with walk-forward validation and costs." },
};

/** Origin-aware endpoint, so snippets show the real host this page is served from. */
export function useEndpoint(): string {
  const [endpoint, setEndpoint] = useState("/api/mcp");
  useEffect(() => {
    queueMicrotask(() => setEndpoint(`${window.location.origin}/api/mcp`));
  }, []);
  return endpoint;
}

export function EndpointSnippets() {
  const endpoint = useEndpoint();
  const blocks: Array<[string, string]> = [
    ["Claude Code", `claude mcp add --transport http meridian ${endpoint}`],
    ["MCP Inspector", `npx @modelcontextprotocol/inspector --cli ${endpoint} --transport http --method tools/list`],
    [
      "Raw JSON-RPC (curl)",
      `curl -s ${endpoint} \\\n  -H 'Content-Type: application/json' \\\n  -H 'Accept: application/json, text/event-stream' \\\n  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"recommend_bundle_tip","arguments":{"level":95,"confidence":0.9}}}'`,
    ],
  ];
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-line bg-paper p-4">
        <Eyebrow>Endpoint</Eyebrow>
        <code className="mt-1 block break-all text-[0.95rem] text-accent-strong">{endpoint}</code>
      </div>
      {blocks.map(([label, code]) => (
        <div key={label}>
          <Eyebrow className="mb-1">{label}</Eyebrow>
          <pre className="overflow-x-auto rounded-lg border border-line bg-subtle p-3 text-[0.8rem] leading-relaxed">{code}</pre>
        </div>
      ))}
    </div>
  );
}

export function McpPlayground({ tools }: { tools: Array<{ name: string; title: string; description: string }> }) {
  const [name, setName] = useState("recommend_bundle_tip");
  const [args, setArgs] = useState(JSON.stringify(EXAMPLES.recommend_bundle_tip, null, 2));
  const [out, setOut] = useState<string>("");
  const [meta, setMeta] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const tool = tools.find((t) => t.name === name);

  const pick = (n: string) => {
    setName(n);
    setArgs(JSON.stringify(EXAMPLES[n] ?? {}, null, 2));
    setOut("");
    setMeta("");
  };

  const call = async () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(args || "{}");
    } catch {
      setOut("Arguments are not valid JSON.");
      return;
    }
    setBusy(true);
    const t0 = performance.now();
    try {
      const res = await fetch("/api/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", "MCP-Protocol-Version": "2025-06-18" },
        body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method: "tools/call", params: { name, arguments: parsed } }),
      });
      const json = await res.json();
      setMeta(`HTTP ${res.status} · ${Math.round(performance.now() - t0)} ms · isError: ${String(json.result?.isError ?? Boolean(json.error))}`);
      setOut(JSON.stringify(json, null, 2));
    } catch (e) {
      setOut(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="rounded-lg border border-line bg-paper p-4">
        <label className="block">
          <Eyebrow>Tool</Eyebrow>
          <select
            value={name}
            onChange={(e) => pick(e.target.value)}
            className="mt-1 w-full rounded-md border border-line-strong bg-paper px-3 py-2 text-sm"
          >
            {tools.map((t) => (
              <option key={t.name} value={t.name}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        {tool ? <p className="mt-2 text-[0.8rem] text-muted">{tool.description}</p> : null}
        <label className="mt-4 block">
          <Eyebrow>Arguments (JSON)</Eyebrow>
          <textarea
            value={args}
            onChange={(e) => setArgs(e.target.value)}
            rows={8}
            spellCheck={false}
            className="mt-1 w-full rounded-md border border-line-strong bg-subtle p-3 font-mono text-[0.8rem]"
          />
        </label>
        <Button className="mt-3" onClick={call} disabled={busy}>
          {busy ? "Calling…" : "Call tools/call →"}
        </Button>
      </div>
      <div className="rounded-lg border border-line bg-paper p-4">
        <div className="flex items-center justify-between">
          <Eyebrow>JSON-RPC response</Eyebrow>
          <span className="tnum text-[0.75rem] text-faint">{meta}</span>
        </div>
        <pre className="mt-2 max-h-[420px] overflow-auto rounded-md bg-subtle p-3 text-[0.75rem] leading-snug">{out || "—"}</pre>
      </div>
    </div>
  );
}
