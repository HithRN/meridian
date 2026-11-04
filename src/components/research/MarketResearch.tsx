"use client";

import * as React from "react";
import { Check, Copy, Download, LoaderCircle, Printer, RefreshCw, X } from "lucide-react";
import { Badge, Button, Card, CardBody } from "@/components/ui/primitives";
import { formatCompact, formatPrice } from "@/core/market/book";
import { ANALYSIS_KINDS, ANALYSIS_LABELS, type AnalysisKind, type EvidenceTest, type Finding, type MarketReport, type PlanOverrides, type ResearchEvent, type TraceStep, type Verdict } from "@/core/market/research/types";
import { ResearchChart } from "@/components/research/ResearchCharts";
import { loadReports, saveReport } from "@/components/research/reportStore";
import { cn } from "@/lib/cn";

const EXAMPLES: Array<{ topic: string; q: string }> = [
  { topic: "Trend", q: "Is SOL in a real uptrend over the last 30 days, or is it noise?" },
  { topic: "Risk", q: "How risky is JTO right now compared with its own history?" },
  { topic: "Correlation", q: "Is SOL still moving with BTC, and does it fall harder when BTC falls?" },
  { topic: "Strategy", q: "Does 24-hour momentum work on SOL after trading costs?" },
  { topic: "Positioning", q: "Is funding on HYPE crowded, and does it predict returns?" },
  { topic: "Execution", q: "How much would a $1M SOL order cost to execute right now?" },
  { topic: "Scenarios", q: "Where could SOL be in the next 30 days?" },
  { topic: "MEV", q: "Does Solana MEV rise when SOL gets more volatile?" },
  { topic: "Timing", q: "Which hours of the day are most volatile for BTC?" },
  { topic: "Compare", q: "Compare SOL, ETH and JTO over the past 6 months" },
];

const WINDOWS: Array<{ days: number; label: string }> = [
  { days: 1, label: "24 hours" },
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
  { days: 180, label: "6 months" },
  { days: 365, label: "1 year" },
];

const VERDICTS: Record<Verdict, { label: string; variant: "success" | "warning" | "info" | "muted" }> = {
  clear: { label: "Clear evidence", variant: "success" },
  inconclusive: { label: "Not proven", variant: "warning" },
  measured: { label: "Measured", variant: "info" },
  skipped: { label: "Could not run", variant: "muted" },
};

const fmtP = (p: number) => (p < 0.001 ? "under 0.1%" : `${(p * 100).toFixed(p < 0.1 ? 1 : 0)}%`);
const stamp = (t: number) => new Date(t).toISOString().slice(0, 16).replace("T", " ") + " UTC";

export function MarketResearch() {
  const [question, setQuestion] = React.useState("");
  const [status, setStatus] = React.useState<"idle" | "running" | "done" | "error">("idle");
  const [steps, setSteps] = React.useState<TraceStep[]>([]);
  const [report, setReport] = React.useState<MarketReport | null>(null);
  const [previous, setPrevious] = React.useState<MarketReport | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const abort = React.useRef<AbortController | null>(null);
  const top = React.useRef<HTMLDivElement>(null);

  const run = React.useCallback(async (q: string, overrides?: PlanOverrides) => {
    const asked = q.trim();
    if (asked.length < 4) return;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setQuestion(asked);
    setStatus("running");
    setSteps([]);
    setError(null);
    window.history.replaceState(null, "", `/research?q=${encodeURIComponent(asked)}`);
    try {
      const res = await fetch("/api/research/market", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: asked, overrides }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) throw new Error((await res.json().catch(() => null))?.error ?? "The research service could not be reached.");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as ResearchEvent;
          if (event.type === "step") setSteps((s) => [...s, event.step]);
          if (event.type === "error") throw new Error(event.message);
          if (event.type === "report") {
            setPrevious(loadReports().find((r) => r.question === asked) ?? null);
            saveReport(event.report);
            setReport(event.report);
            setStatus("done");
            top.current?.scrollIntoView({ behavior: "smooth", block: "start" });
          }
        }
        if (done) break;
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(err instanceof Error ? err.message : "The research could not be completed.");
      setStatus("error");
    }
  }, []);

  // Open a saved report or run a question passed in the link.
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const saved = params.get("report");
    const q = params.get("q");
    const timer = setTimeout(() => {
      if (saved) {
        const found = loadReports().find((r) => r.id === saved);
        if (found) {
          setQuestion(found.question);
          setReport(found);
          setStatus("done");
          return;
        }
      }
      if (q) void run(q);
    }, 0);
    return () => clearTimeout(timer);
  }, [run]);

  const busy = status === "running";

  return (
    <div>
      <Card className="print:hidden">
        <CardBody className="space-y-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(question);
            }}
          >
            <label htmlFor="market-question" className="text-[1.1rem] font-semibold text-heading">What do you want to know about the market right now?</label>
            <textarea
              id="market-question"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void run(question);
                }
              }}
              rows={2}
              maxLength={600}
              placeholder="Ask in plain words, for example: is SOL still moving with BTC?"
              className="mt-2 w-full resize-y rounded-md border border-line bg-paper px-4 py-3 text-[1.05rem] leading-relaxed outline-none transition-colors focus:border-accent"
            />
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-[0.9rem] text-muted">Prices, order books and funding are pulled live when you press the button.</p>
              <Button type="submit" disabled={busy || question.trim().length < 4}>{busy ? "Researching…" : "Research this →"}</Button>
            </div>
          </form>
          <div className="flex flex-wrap gap-2 border-t border-divider pt-4">
            {EXAMPLES.map((e) => (
              <button
                key={e.q}
                disabled={busy}
                onClick={() => void run(e.q)}
                title={e.q}
                className="rounded-full border border-line px-3 py-[3px] text-[0.88rem] text-muted transition-colors hover:border-accent hover:bg-accent-soft hover:text-heading disabled:opacity-50"
              >
                {e.q.length > 44 ? e.topic : e.q}
              </button>
            ))}
          </div>
        </CardBody>
      </Card>

      <div ref={top} className="scroll-mt-4" />

      {busy ? <Progress steps={steps} /> : null}
      {status === "error" && error ? (
        <div className="mt-6 rounded-lg border border-line bg-warning-bg px-5 py-4 text-ink" role="alert">{error}</div>
      ) : null}
      {report && !busy ? <Report report={report} previous={previous} onRun={run} /> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ progress */

function Progress({ steps }: { steps: TraceStep[] }) {
  return (
    <div className="mt-6 rounded-lg border border-line bg-paper p-5" aria-live="polite">
      <ul className="space-y-[6px] text-[0.98rem]">
        {steps.map((s, i) => (
          <li key={i} className="fade-up flex items-baseline gap-2">
            <Check size={14} className="shrink-0 translate-y-[2px] text-positive" aria-hidden />
            <span className="text-ink">{s.label}</span>
            {s.detail ? <span className="text-muted">{s.detail}</span> : null}
          </li>
        ))}
        <li className="flex items-center gap-2 text-muted">
          <LoaderCircle size={14} className="animate-spin" aria-hidden /> Working
        </li>
      </ul>
    </div>
  );
}

/* -------------------------------------------------------------------- report */

function Report({ report, previous, onRun }: { report: MarketReport; previous: MarketReport | null; onRun: (q: string, o?: PlanOverrides) => void }) {
  const [copied, setCopied] = React.useState(false);
  const verdict = VERDICTS[report.answer.verdict];

  const copyLink = async () => {
    await navigator.clipboard.writeText(`${window.location.origin}/research?q=${encodeURIComponent(report.question)}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  const downloadJson = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `meridian-market-research-${report.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <article className="fade-up mt-8">
      {/* The answer */}
      <div className="rounded-xl border border-line bg-paper p-6 shadow-[0_1px_2px_rgba(24,54,80,0.04)] md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <p className="max-w-3xl text-[1rem] italic text-muted">{report.question}</p>
          <Badge variant={verdict.variant}>{verdict.label}</Badge>
        </div>
        <h2 className="mt-3 max-w-4xl text-[1.55rem] font-semibold leading-snug tracking-tight text-heading">{report.answer.headline}</h2>
        {report.answer.points.length ? (
          <ul className="mt-4 max-w-4xl space-y-2 text-[1.04rem] leading-relaxed text-ink">
            {report.answer.points.map((p) => (
              <li key={p} className="border-l-2 border-divider pl-3">{p}</li>
            ))}
          </ul>
        ) : null}
        <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-divider pt-4 text-[0.9rem] text-muted print:hidden">
          <span>Data as of {stamp(report.createdAt)}</span>
          <span className="flex-1" />
          <ReportAction icon={<RefreshCw size={14} />} onClick={() => onRun(report.question)}>Run again on fresh data</ReportAction>
          <ReportAction icon={copied ? <Check size={14} /> : <Copy size={14} />} onClick={() => void copyLink()}>{copied ? "Link copied" : "Copy link"}</ReportAction>
          <ReportAction icon={<Download size={14} />} onClick={downloadJson}>Download</ReportAction>
          <ReportAction icon={<Printer size={14} />} onClick={() => window.print()}>Save as PDF</ReportAction>
        </div>
      </div>

      <SinceLastRun report={report} previous={previous} />
      <Snapshot report={report} />
      <PlanEditor key={report.id} report={report} onRun={onRun} />

      {report.findings.map((f) => (
        <FindingSection key={f.kind} finding={f} tests={report.tests} />
      ))}

      <Evidence report={report} />
      <Provenance report={report} />
    </article>
  );
}

function ReportAction({ icon, onClick, children }: { icon: React.ReactNode; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="inline-flex items-center gap-[6px] text-link underline-offset-2 hover:underline">
      {icon}
      {children}
    </button>
  );
}

function Snapshot({ report }: { report: MarketReport }) {
  if (!report.snapshot.length) return null;
  return (
    <div className="mt-4 overflow-x-auto rounded-lg border border-line bg-paper">
      <table className="w-full border-collapse text-[0.95rem]">
        <thead>
          <tr className="border-b border-line text-left text-[0.84rem] text-faint">
            {["Market", "Price", "24 hours", "24h volume", "Open interest", "Funding (yearly rate)"].map((h) => <th key={h} className="px-4 py-2 font-semibold">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {report.snapshot.map((s) => (
            <tr key={s.coin} className="border-b border-divider last:border-b-0">
              <td className="px-4 py-2 font-semibold text-heading">{s.coin}</td>
              <td className="tnum px-4 py-2">${formatPrice(s.price)}</td>
              <td className={cn("tnum px-4 py-2", s.change24h >= 0 ? "text-positive" : "text-negative")}>{s.change24h >= 0 ? "+" : ""}{(s.change24h * 100).toFixed(2)}%</td>
              <td className="tnum px-4 py-2">${formatCompact(s.volumeUsd)}</td>
              <td className="tnum px-4 py-2">${formatCompact(s.openInterestUsd)}</td>
              <td className="tnum px-4 py-2">{(s.fundingApr * 100).toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* --------------------------------------------------------------- plan editor */

function PlanEditor({ report, onRun }: { report: MarketReport; onRun: (q: string, o?: PlanOverrides) => void }) {
  const { plan } = report;
  const [assets, setAssets] = React.useState(plan.assets);
  const [draft, setDraft] = React.useState("");
  const [days, setDays] = React.useState(plan.days);
  const [analyses, setAnalyses] = React.useState<AnalysisKind[]>(plan.analyses);

  const dirty = assets.join() !== plan.assets.join() || days !== plan.days || [...analyses].sort().join() !== [...plan.analyses].sort().join();
  const toggle = (k: AnalysisKind) => setAnalyses((a) => (a.includes(k) ? (a.length > 1 ? a.filter((x) => x !== k) : a) : [...a, k]));
  const addAsset = () => {
    const coin = draft.trim().replace(/^\$/, "");
    if (!coin) return;
    const name = /^k[A-Z]/.test(coin) ? coin : coin.toUpperCase();
    if (!assets.includes(name) && assets.length < 5) setAssets([...assets, name]);
    setDraft("");
  };
  const windowOptions = WINDOWS.some((w) => w.days === days) ? WINDOWS : [...WINDOWS, { days, label: `${Math.round(days)} days` }].sort((a, b) => a.days - b.days);

  return (
    <section className="mt-4 rounded-lg border border-line bg-panel px-5 py-4 print:hidden" aria-label="How Meridian read your question">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-[1.02rem] font-semibold text-heading">How Meridian read this. Change anything and update.</h3>
        <Button variant="secondary" disabled={!dirty || !assets.length} onClick={() => onRun(report.question, { assets, days, analyses })}>Update report</Button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="w-16 text-[0.88rem] text-faint">Markets</span>
        {assets.map((a) => (
          <span key={a} className="inline-flex items-center gap-1 rounded-full border border-line-strong bg-paper py-[2px] pl-3 pr-1 text-[0.9rem] text-heading">
            {a}
            <button onClick={() => setAssets(assets.filter((x) => x !== a))} aria-label={`Remove ${a}`} className="rounded-full p-[2px] text-faint hover:bg-subtle hover:text-heading"><X size={13} /></button>
          </span>
        ))}
        {assets.length < 5 ? (
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={addAsset}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addAsset();
              }
            }}
            placeholder="Add a ticker"
            aria-label="Add a market by ticker"
            className="w-28 rounded-full border border-line bg-paper px-3 py-[2px] text-[0.9rem] outline-none focus:border-accent"
          />
        ) : null}
        <span className="ml-4 text-[0.88rem] text-faint">Window</span>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Time window" className="rounded-md border border-line bg-paper px-2 py-[3px] text-[0.9rem] text-heading">
          {windowOptions.map((w) => <option key={w.days} value={w.days}>{w.label}</option>)}
        </select>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="w-16 text-[0.88rem] text-faint">Topics</span>
        {ANALYSIS_KINDS.map((k) => {
          const on = analyses.includes(k);
          return (
            <button key={k} onClick={() => toggle(k)} aria-pressed={on} className={cn("rounded-full border px-3 py-[2px] text-[0.9rem] transition-colors", on ? "border-accent bg-accent text-on-accent" : "border-line bg-paper text-muted hover:border-accent hover:text-heading")}>
              {ANALYSIS_LABELS[k]}
            </button>
          );
        })}
      </div>
      {plan.notes.length || plan.unknownAssets.length ? (
        <ul className="mt-3 space-y-1 text-[0.9rem] text-muted">
          {plan.notes.map((n) => <li key={n}>{n}</li>)}
          {plan.unknownAssets.length ? <li>Not traded in this data, so left out: {plan.unknownAssets.join(", ")}.</li> : null}
        </ul>
      ) : null}
    </section>
  );
}

/* ------------------------------------------------------------------ findings */

function FindingSection({ finding: f, tests }: { finding: Finding; tests: EvidenceTest[] }) {
  const verdict = VERDICTS[f.verdict];
  const own = tests.filter((t) => f.testIds.includes(t.id));
  return (
    <section className="mt-10 break-inside-avoid-page">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-divider pb-2">
        <h3 className="text-[1.4rem] font-semibold tracking-tight text-heading">{f.title}</h3>
        <Badge variant={verdict.variant}>{verdict.label}</Badge>
      </div>
      <p className="mt-3 max-w-4xl text-[1.08rem] leading-relaxed text-ink">{f.headline}</p>

      {f.stats.length ? (
        <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line lg:grid-cols-4">
          {f.stats.map((s) => (
            <div key={s.label} className="bg-paper px-4 py-3">
              <div className="text-[0.86rem] text-muted">{s.label}</div>
              <div className="tnum mt-1 text-[1.3rem] font-semibold leading-tight text-heading">{s.value}</div>
              {s.hint ? <div className="mt-1 text-[0.84rem] leading-snug text-faint">{s.hint}</div> : null}
            </div>
          ))}
        </div>
      ) : null}

      {f.table ? (
        <div className="mt-4 overflow-x-auto rounded-lg border border-line bg-paper">
          <table className="w-full border-collapse text-[0.95rem]">
            <thead>
              <tr className="border-b border-line text-left text-[0.84rem] text-faint">
                {f.table.columns.map((c) => <th key={c} className="px-4 py-2 font-semibold">{c}</th>)}
              </tr>
            </thead>
            <tbody>
              {f.table.rows.map((r) => (
                <tr key={r[0]} className="border-b border-divider last:border-b-0">
                  {r.map((c, i) => <td key={i} className={cn("tnum px-4 py-2", i === 0 && "font-semibold text-heading")}>{c}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {f.charts.length ? (
        <div className={cn("mt-5 grid grid-cols-1 gap-5", f.charts.length > 1 && "xl:grid-cols-2")}>
          {f.charts.map((c) => (
            <div key={c.title} className="min-w-0 rounded-lg border border-line bg-paper p-4 md:p-5">
              <ResearchChart spec={c} />
            </div>
          ))}
        </div>
      ) : null}

      {f.cautions.length ? (
        <div className="mt-4 rounded-lg border border-line bg-warning-bg px-4 py-3">
          <div className="text-[0.92rem] font-semibold text-heading">Reasons to be careful</div>
          <ul className="mt-1 space-y-1 text-[0.95rem] leading-relaxed text-ink">
            {f.cautions.map((c) => <li key={c}>{c}</li>)}
          </ul>
        </div>
      ) : null}

      {f.method || own.length ? (
        <details className="mt-3 print:hidden">
          <summary className="cursor-pointer text-[0.92rem] text-link">How this was worked out</summary>
          <p className="mt-2 max-w-4xl text-[0.95rem] leading-relaxed text-muted">{f.method}</p>
        </details>
      ) : null}
    </section>
  );
}

/* ------------------------------------------------------------------ evidence */

function Evidence({ report }: { report: MarketReport }) {
  if (!report.tests.length) return null;
  return (
    <section className="mt-12">
      <div className="border-b border-divider pb-2">
        <h3 className="text-[1.4rem] font-semibold tracking-tight text-heading">Every test in this report</h3>
      </div>
      <p className="mt-3 max-w-4xl text-[0.98rem] leading-relaxed text-muted">
        &ldquo;Luck alone&rdquo; is how often pure chance would produce a result this strong. Running many tests makes a lucky result more likely, so each figure is then adjusted for all {report.tests.length} tests (Benjamini-Hochberg), and a result counts as evidence only if it stays under 5% after that.
      </p>
      <div className="mt-3 overflow-x-auto rounded-lg border border-line bg-paper">
        <table className="w-full border-collapse text-[0.95rem]">
          <thead>
            <tr className="border-b border-line text-left text-[0.84rem] text-faint">
              {["Question", "Result", "Luck alone", "After adjustment", "Evidence?"].map((h) => <th key={h} className="px-4 py-2 font-semibold">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {report.tests.map((t) => (
              <tr key={t.id} className="border-b border-divider last:border-b-0" title={t.method}>
                <td className="px-4 py-2 text-ink">{t.question}</td>
                <td className="tnum px-4 py-2 text-ink">{t.effect}</td>
                <td className="tnum px-4 py-2 text-muted">{fmtP(t.p)}</td>
                <td className="tnum px-4 py-2 text-muted">{fmtP(t.pAdjusted)}</td>
                <td className="px-4 py-2">{t.significant ? <span className="font-semibold text-positive">Yes</span> : <span className="text-muted">No</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Provenance({ report }: { report: MarketReport }) {
  return (
    <details className="mt-8 rounded-lg border border-line bg-panel px-5 py-4">
      <summary className="cursor-pointer text-[1rem] font-semibold text-heading">Data and audit trail</summary>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full border-collapse text-[0.92rem]">
          <thead>
            <tr className="text-left text-[0.84rem] text-faint">
              {["Data", "Source", "Rows", "From", "To"].map((h) => <th key={h} className="px-2 py-1 font-semibold">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {report.sources.map((s) => (
              <tr key={s.id} className="border-t border-divider align-top">
                <td className="px-2 py-1 text-ink">{s.label}{s.issues.map((i) => <div key={i} className="text-[0.86rem] text-warning">{i}</div>)}</td>
                <td className="px-2 py-1 text-muted">{s.source}</td>
                <td className="tnum px-2 py-1 text-muted">{s.rows.toLocaleString("en-US")}</td>
                <td className="tnum px-2 py-1 text-muted">{s.from ? stamp(s.from) : "n/a"}</td>
                <td className="tnum px-2 py-1 text-muted">{s.to ? stamp(s.to) : "n/a"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[0.92rem] leading-relaxed text-muted">
        Data fingerprint <code>{report.fingerprint}</code>, random seed {report.seed}, engine {report.engineVersion}. Every number on this page is computed in code from the data above; the same data and seed give the same report.
      </p>
    </details>
  );
}

/* -------------------------------------------------------------------- change */

function SinceLastRun({ report, previous }: { report: MarketReport; previous: MarketReport | null }) {
  if (!previous || previous.id === report.id) return null;
  const before = new Map(previous.tests.map((t) => [t.id, t]));
  const flips = report.tests.filter((t) => before.has(t.id) && before.get(t.id)!.significant !== t.significant);
  const changed = report.tests.filter((t) => before.has(t.id) && before.get(t.id)!.effect !== t.effect);
  return (
    <div className="mt-4 rounded-lg border border-line bg-accent-soft px-5 py-4 print:hidden">
      <div className="text-[1rem] font-semibold text-heading">Since your last run at {stamp(previous.createdAt)}</div>
      <p className="mt-1 text-[0.95rem] text-ink">
        {changed.length === 0 ? "No result has changed." : `${changed.length} of ${report.tests.length} results moved.`}{" "}
        {flips.length === 0 ? "No conclusion changed." : `${flips.length} conclusion${flips.length > 1 ? "s" : ""} changed:`}
      </p>
      {flips.length ? (
        <ul className="mt-1 space-y-1 text-[0.95rem] text-ink">
          {flips.map((t) => (
            <li key={t.id}>{t.question} Now {t.significant ? "evidence" : "not proven"} ({before.get(t.id)!.effect} then, {t.effect} now).</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
