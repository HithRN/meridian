"use client";

import { useEffect, useRef, useState } from "react";
import { PageHeader, PageBody } from "@/components/layout/PageHeader";
import { Badge, Button, Card, CardBody, Eyebrow } from "@/components/ui/primitives";
import { ReportView } from "@/components/experiment/ReportView";
import type { CopilotResponse, CopilotTurn } from "@/core/copilot/types";
import { duration } from "@/lib/format";
import { cn } from "@/lib/cn";

const SUGGESTIONS: Array<{ label: string; q: string }> = [
  { label: "Tip to land a bundle", q: "My arbitrage bundle must land in the next block. What tip should I attach, and how sure can I be?" },
  { label: "JitoSOL vs plain staking", q: "If I stake 1,000 SOL as JitoSOL for a year, how much of the return comes from MEV?" },
  { label: "Test a SOL signal", q: "Test whether a 24-period momentum signal works on SOL, with walk-forward validation and transaction costs." },
  { label: "チップの目安（日本語）", q: "バンドルを確実に通したいです。p95を90%の確率で上回るにはチップはいくら必要ですか？" },
  { label: "JitoSOLの利回り（日本語）", q: "500 SOLを6ヶ月JitoSOLでステーキングした場合の利回りと、MEVの寄与を教えてください。" },
];

interface ChatEntry extends CopilotTurn {
  meta?: CopilotResponse;
}

type EngineChoice = "auto" | "deterministic";

export default function CopilotPage() {
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [claude, setClaude] = useState<boolean | null>(null);
  const [engine, setEngine] = useState<EngineChoice>("auto");
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/copilot")
      .then((r) => r.json())
      .then((j: { claude: boolean }) => setClaude(j.claude))
      .catch(() => setClaude(false));
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [entries, busy]);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    const history: ChatEntry[] = [...entries, { role: "user", content: q }];
    setEntries(history);
    setDraft("");
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          engine,
          messages: history.slice(-20).map(({ role, content }) => ({ role, content })),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      const meta = json as CopilotResponse;
      setEntries((e) => [...e, { role: "assistant", content: meta.reply, meta }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const effectiveEngine: EngineChoice = claude === false ? "deterministic" : engine;
  const activeEngine = effectiveEngine === "deterministic" ? "Deterministic engine" : "Claude · claude-opus-5-5";

  return (
    <>
      <PageHeader
        eyebrow="Solana · Jito" accent="var(--color-mod-agents)"
        title="AI Copilot"
        lede="Ask about Jito tips, JitoSOL yield or a trading hypothesis, in English or 日本語. Claude decides which tools to call, the tools compute the figures, and every call is listed under the answer."
        actions={
          entries.length ? (
            <Button variant="secondary" onClick={() => setEntries([])} disabled={busy}>
              New chat
            </Button>
          ) : null
        }
      />
      <PageBody>
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4">
          <div className="flex items-center gap-3">
            <Eyebrow>Engine</Eyebrow>
            <div className="flex border border-accent">
              {(["auto", "deterministic"] as const).map((e) => (
                <button
                  key={e}
                  onClick={() => setEngine(e)}
                  disabled={busy || (e === "auto" && claude === false)}
                  className={cn(
                    "px-3 py-[5px] text-sm disabled:opacity-40",
                    effectiveEngine === e ? "bg-accent text-on-accent" : "hover:bg-subtle",
                  )}
                >
                  {e === "auto" ? "Claude" : "Deterministic"}
                </button>
              ))}
            </div>
            <Badge variant="muted">{claude === null ? "checking…" : activeEngine}</Badge>
          </div>
          {claude === false ? (
            <span className="text-[0.78rem] text-faint">
              Set <code className="border border-line px-1">ANTHROPIC_API_KEY</code> on the server to enable Claude.
            </span>
          ) : null}
        </div>

        {entries.length === 0 ? (
          <div className="mb-8">
            <Eyebrow className="mb-3">Try one</Eyebrow>
            <div className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-line bg-line md:grid-cols-2 lg:grid-cols-3">
              {SUGGESTIONS.map((s) => (
                <button key={s.label} onClick={() => send(s.q)} className="bg-paper px-5 py-4 text-left hover:bg-subtle">
                  <div className="text-[0.95rem]">{s.label}</div>
                  <div className="mt-1 line-clamp-2 text-[0.8rem] text-muted">{s.q}</div>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="space-y-6">
          {entries.map((e, i) => (e.role === "user" ? <UserTurn key={i} text={e.content} /> : <AssistantTurn key={i} entry={e} />))}
          {busy ? (
            <div className="border-l-2 border-line pl-4 text-sm text-muted">
              Calling tools and composing an answer…
            </div>
          ) : null}
          {error ? <div className="border border-accent px-4 py-3 text-sm">Request failed: {error}</div> : null}
          <div ref={endRef} />
        </div>

        <form
          className="sticky bottom-0 mt-8 border-t border-line-strong bg-paper py-4"
          onSubmit={(ev) => {
            ev.preventDefault();
            send(draft);
          }}
        >
          <div className="flex items-end gap-3">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  send(draft);
                }
              }}
              rows={2}
              disabled={busy}
              placeholder="Ask anything about Jito tips, JitoSOL or a strategy… / 日本語でもどうぞ"
              className="min-w-0 flex-1 resize-none border border-line bg-paper px-4 py-3 text-[1rem] outline-none focus:border-accent disabled:opacity-60"
            />
            <Button type="submit" disabled={busy || draft.trim().length < 2}>
              {busy ? "Thinking…" : "Send →"}
            </Button>
          </div>
        </form>
      </PageBody>
    </>
  );
}

function UserTurn({ text }: { text: string }) {
  return (
    <div className="ml-auto max-w-3xl border border-line bg-subtle px-5 py-3">
      <Eyebrow className="mb-1">You</Eyebrow>
      <p className="whitespace-pre-wrap">{text}</p>
    </div>
  );
}

function AssistantTurn({ entry }: { entry: ChatEntry }) {
  const meta = entry.meta;
  return (
    <Card className="max-w-4xl">
      <CardBody>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Eyebrow>Meridian Copilot</Eyebrow>
          {meta ? (
            <Badge variant="muted">{meta.engine === "claude" ? meta.model ?? "Claude" : "deterministic"}</Badge>
          ) : null}
        </div>
        {meta?.notice ? <p className="mb-2 text-[0.8rem] text-faint">{meta.notice}</p> : null}
        <ReportView markdown={entry.content} />
        {meta?.toolCalls.length ? (
          <div className="mt-4 border-t border-line pt-3">
            <Eyebrow className="mb-2">Evidence · {meta.toolCalls.length} tool call{meta.toolCalls.length === 1 ? "" : "s"}</Eyebrow>
            <div className="space-y-1">
              {meta.toolCalls.map((c, i) => (
                <details key={i} className="group border border-line">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm hover:bg-subtle">
                    <span className="flex items-center gap-3">
                      <span className="tnum text-[0.68rem] text-faint">{String(i + 1).padStart(2, "0")}</span>
                      <code>{c.name}</code>
                      {!c.ok ? <Badge variant="outline">error</Badge> : null}
                    </span>
                    <span className="tnum text-[0.75rem] text-faint">{duration(c.durationMs)} ▾</span>
                  </summary>
                  <div className="grid grid-cols-1 gap-3 border-t border-line px-3 py-3 md:grid-cols-2">
                    <div>
                      <Eyebrow className="mb-1">Input</Eyebrow>
                      <pre className="max-h-64 overflow-auto bg-subtle p-2 text-[0.75rem] leading-snug">{JSON.stringify(c.input, null, 2)}</pre>
                    </div>
                    <div>
                      <Eyebrow className="mb-1">{c.ok ? "Output" : "Error"}</Eyebrow>
                      <pre className="max-h-64 overflow-auto bg-subtle p-2 text-[0.75rem] leading-snug">
                        {c.ok ? JSON.stringify(c.output, null, 2) : c.error}
                      </pre>
                    </div>
                  </div>
                </details>
              ))}
            </div>
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}
