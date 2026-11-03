"use client";

import * as React from "react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge, Card, CardBody, CardHeader, Eyebrow, KeyValue } from "@/components/ui/primitives";
import { ChartCaption } from "@/components/charts/PlainCharts";
import { parseTipFloor } from "@/core/solana/live";
import { LAMPORTS_PER_SOL, getTipAdvisor, type TipFloorSnapshot, type TipLevel } from "@/core/solana/tips";
import { cn } from "@/lib/cn";

const STREAM_URL = "wss://bundles.jito.wtf/api/v1/bundles/tip_stream";
const POLL_MS = 15_000;
const AXIS = { fontFamily: '"Times New Roman", Times, serif', fontSize: 12, fill: "var(--color-muted)" };
const GRID = "var(--color-chart-grid)";
const lam = (sol: number) => Math.round(sol * LAMPORTS_PER_SOL);
const fmt = (v: number) => (v >= 1e6 ? `${(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(1)}k` : String(Math.round(v)));

interface Tick extends TipFloorSnapshot {
  at: number;
}

interface Alert {
  at: number;
  kind: "spike" | "quiet" | "regime";
  title: string;
  detail: string;
}

const LINES: Array<{ key: "p25" | "p50" | "p75" | "p95" | "p99"; label: string; color: string; width: number }> = [
  { key: "p99", label: "99th", color: "var(--color-chart-negative)", width: 1.4 },
  { key: "p95", label: "95th", color: "var(--color-chart-risk)", width: 1.8 },
  { key: "p75", label: "75th", color: "var(--color-chart-primary)", width: 2 },
  { key: "p50", label: "50th (typical)", color: "var(--color-chart-tertiary)", width: 2.2 },
  { key: "p25", label: "25th", color: "var(--color-chart-benchmark)", width: 1.4 },
];

/** Live tip feed: Jito's WebSocket stream, falling back to polling the server. */
function useTipFeed() {
  const [ticks, setTicks] = React.useState<Tick[]>([]);
  const [mode, setMode] = React.useState<"connecting" | "stream" | "polling">("connecting");

  React.useEffect(() => {
    let alive = true;
    let ws: WebSocket | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    const push = (s: TipFloorSnapshot | null) => {
      if (!s || !alive) return;
      setTicks((prev) => (prev.length && prev[prev.length - 1].time === s.time ? prev : [...prev.slice(-239), { ...s, at: Date.now() }]));
    };
    const poll = () =>
      fetch("/api/jito")
        .then((r) => r.json())
        .then((j) => push(j.tipFloor?.data ?? null))
        .catch(() => undefined);
    const startPolling = () => {
      if (timer || !alive) return;
      setMode("polling");
      timer = setInterval(poll, POLL_MS);
    };
    poll();
    try {
      ws = new WebSocket(STREAM_URL);
      ws.onopen = () => alive && setMode("stream");
      ws.onmessage = (e) => {
        try {
          push(parseTipFloor(JSON.parse(String(e.data))));
        } catch {
          /* ignore malformed frames */
        }
      };
      ws.onerror = () => ws?.close();
      ws.onclose = () => startPolling();
    } catch {
      queueMicrotask(startPolling);
    }
    return () => {
      alive = false;
      ws?.close();
      if (timer) clearInterval(timer);
    };
  }, []);

  return { ticks, mode };
}

function useNow(ms = 1000) {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export function LiveAuction() {
  const { ticks, mode } = useTipFeed();
  const now = useNow();
  const advisor = React.useMemo(() => getTipAdvisor(), []);
  const latest = ticks[ticks.length - 1] ?? null;

  const alerts = React.useMemo(() => {
    const out: Alert[] = [];
    for (let i = 1; i < ticks.length; i++) {
      const prev = ticks[i - 1];
      const cur = ticks[i];
      const hi = advisor.recommend(95, 0.95, prev).tipSol;
      const lo = advisor.recommend(95, 0.05, prev).tipSol;
      if (cur.p95 > hi) {
        out.push({
          at: cur.at,
          kind: "spike",
          title: `Competitive tips jumped to ${fmt(lam(cur.p95))} lamports`,
          detail: `The 95th-percentile tip moved from ${fmt(lam(prev.p95))} to ${fmt(lam(cur.p95))}, above the model's 95% forecast band of ${fmt(lam(hi))}. Usually a burst of competition for the same opportunity, such as a launch or a liquidation cascade.`,
        });
      } else if (cur.p95 < lo) {
        out.push({
          at: cur.at,
          kind: "quiet",
          title: `Competition eased: p95 fell to ${fmt(lam(cur.p95))} lamports`,
          detail: `Below the model's lower band of ${fmt(lam(lo))}. A cheaper window for bundles that do not need top priority.`,
        });
      }
      const rPrev = advisor.recommend(95, 0.8, prev).regime;
      const rCur = advisor.recommend(95, 0.8, cur).regime;
      if (rPrev !== rCur) {
        out.push({ at: cur.at, kind: "regime", title: `Market regime changed: ${rPrev} → ${rCur}`, detail: "Typical tips moved relative to their recent average, so the advisor switched to a different calibration." });
      }
    }
    return out.reverse().slice(0, 8);
  }, [ticks, advisor]);

  const series = ticks.map((t) => ({ at: t.at, p25: lam(t.p25), p50: lam(t.p50), p75: lam(t.p75), p95: lam(t.p95), p99: lam(t.p99) }));
  const ago = latest ? Math.max(0, Math.round((now - latest.at) / 1000)) : null;
  const regime = latest ? advisor.recommend(95, 0.8, latest).regime : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3 text-[0.92rem]">
        <span className="relative flex h-3 w-3">
          {mode !== "connecting" ? <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-chart-positive opacity-50" /> : null}
          <span className={cn("relative inline-flex h-3 w-3 rounded-full", mode === "connecting" ? "bg-chart-benchmark" : "bg-chart-positive")} />
        </span>
        <span className="font-semibold text-heading">
          {mode === "stream" ? "Streaming from Jito's block engine" : mode === "polling" ? `Live, refreshed every ${POLL_MS / 1000} s` : "Connecting…"}
        </span>
        <span className="text-faint">
          {ticks.length} update{ticks.length === 1 ? "" : "s"} since you opened the page{ago !== null ? ` · last ${ago}s ago` : ""}
        </span>
        {regime ? <Badge variant={regime === "hot" ? "warning" : regime === "calm" ? "success" : "info"}>{regime} market</Badge> : null}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Landed tips, live" eyebrow="Percentiles of tips paid by bundles that landed, in lamports (log scale)" />
          <CardBody>
            {series.length ? (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={series} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
                  <CartesianGrid stroke={GRID} vertical={false} />
                  <XAxis dataKey="at" type="number" domain={["dataMin", "dataMax"]} tickFormatter={(t) => new Date(t).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })} tick={AXIS} stroke={GRID} minTickGap={60} />
                  <YAxis scale="log" domain={["auto", "auto"]} tickFormatter={fmt} tick={AXIS} stroke={GRID} width={52} allowDataOverflow />
                  <Tooltip
                    content={({ active, payload }) =>
                      active && payload?.length ? (
                        <div className="rounded-md border border-line bg-paper px-3 py-2 text-[0.85rem] shadow-sm">
                          {LINES.map((l) => (
                            <div key={l.key}>{l.label}: {Number(payload[0].payload[l.key]).toLocaleString("en-US")}</div>
                          ))}
                        </div>
                      ) : null
                    }
                  />
                  {LINES.map((l) => (
                    <Line key={l.key} type="stepAfter" dataKey={l.key} stroke={l.color} strokeWidth={l.width} dot={series.length < 3 ? { r: 3 } : false} isAnimationActive={false} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-[280px] items-center justify-center text-muted">Waiting for the first update…</div>
            )}
            <div className="mt-2 flex flex-wrap gap-4 text-[0.85rem] text-muted">
              {LINES.map((l) => (
                <span key={l.key} className="inline-flex items-center gap-2">
                  <span className="h-[3px] w-4 rounded" style={{ background: l.color }} />
                  {l.label}
                </span>
              ))}
            </div>
            <ChartCaption>
              The chart grows as new auction data arrives. The green line is what a typical landed bundle paid; the gap up to the
              orange and red lines shows how much more the most competitive bundles paid.
            </ChartCaption>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Right now" eyebrow={latest ? `As of ${new Date(latest.time).toLocaleTimeString("en-US", { hour12: false })}` : "Waiting"} />
          <CardBody>
            {latest ? <PercentileBars snap={latest} /> : <p className="text-muted">Waiting…</p>}
          </CardBody>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <TipSimulator latest={latest} />
        <Card>
          <CardHeader title="Unusual activity" eyebrow="Live tips compared with the model's forecast band" />
          <CardBody>
            {alerts.length === 0 ? (
              <p className="text-[0.95rem] text-muted">
                Nothing unusual since you opened the page. An alert appears when competitive tips move outside the range the model
                expected, with an explanation of what it usually means.
              </p>
            ) : (
              <ul className="space-y-3">
                {alerts.map((a, i) => (
                  <li key={i} className={cn("rounded-md border-l-4 bg-panel px-3 py-2", a.kind === "spike" ? "border-chart-risk" : a.kind === "quiet" ? "border-chart-positive" : "border-chart-primary")}>
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-semibold text-heading">{a.title}</span>
                      <span className="tnum text-[0.8rem] text-faint">{new Date(a.at).toLocaleTimeString("en-US", { hour12: false })}</span>
                    </div>
                    <p className="mt-1 text-[0.88rem] text-muted">{a.detail}</p>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function PercentileBars({ snap }: { snap: TipFloorSnapshot }) {
  const data = [
    { k: "25th", v: lam(snap.p25), c: "var(--color-chart-benchmark)" },
    { k: "50th", v: lam(snap.p50), c: "var(--color-chart-tertiary)" },
    { k: "75th", v: lam(snap.p75), c: "var(--color-chart-primary)" },
    { k: "95th", v: lam(snap.p95), c: "var(--color-chart-risk)" },
    { k: "99th", v: lam(snap.p99), c: "var(--color-chart-negative)" },
  ];
  return (
    <div>
      <ResponsiveContainer width="100%" height={230}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 52, bottom: 4, left: 4 }}>
          <XAxis type="number" scale="log" domain={["auto", "auto"]} hide />
          <YAxis type="category" dataKey="k" tick={AXIS} stroke={GRID} width={40} />
          <Bar dataKey="v" barSize={20} radius={[0, 3, 3, 0]} isAnimationActive={false} label={{ position: "right", formatter: (v: unknown) => fmt(Number(v)), fill: "var(--color-ink)", fontSize: 12 }}>
            {data.map((d) => (
              <Cell key={d.k} fill={d.c} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <ChartCaption>
        To outbid most landed bundles you need the 75th; to be near the front, the 95th. The 99th is {Math.round(snap.p99 / Math.max(snap.p50, 1e-12))}×
        the typical tip.
      </ChartCaption>
    </div>
  );
}

const PRIORITIES: Array<{ id: TipLevel; label: string }> = [
  { id: 50, label: "Standard" },
  { id: 75, label: "Competitive" },
  { id: 95, label: "High" },
  { id: 99, label: "Urgent" },
];

function TipSimulator({ latest }: { latest: TipFloorSnapshot | null }) {
  const advisor = React.useMemo(() => getTipAdvisor(), []);
  const [level, setLevel] = React.useState<TipLevel>(75);
  const [prob, setProb] = React.useState(0.8);
  const [cuK, setCuK] = React.useState(200);
  const [budget, setBudget] = React.useState(200_000);

  const rec = advisor.recommend(level, prob, latest);
  const low = advisor.recommend(level, Math.max(0.5, prob - 0.15), latest);
  let reachable = 0;
  for (let c = 0.05; c <= 0.99; c += 0.01) if (advisor.recommend(level, c, latest).tipLamports <= budget) reachable = c;
  const band = latest
    ? (["p25", "p50", "p75", "p95", "p99"] as const).filter((k) => budget >= lam(latest[k])).pop()
    : undefined;
  const bandText = band ? `above the live ${band.slice(1)}th percentile` : "below the live 25th percentile";
  const ok = budget >= rec.tipLamports;

  return (
    <Card className="border-accent">
      <CardHeader title="Tip optimisation simulator" eyebrow="Estimate a tip from live conditions" />
      <CardBody className="space-y-4">
        <div>
          <Eyebrow>Priority</Eyebrow>
          <div className="mt-1 flex overflow-hidden rounded-md border border-line-strong">
            {PRIORITIES.map((p) => (
              <button key={p.id} onClick={() => setLevel(p.id)} className={cn("flex-1 px-2 py-[6px] text-[0.9rem]", level === p.id ? "bg-accent text-on-accent" : "hover:bg-subtle")}>
                {p.label}
                <span className="block text-[0.72rem] opacity-75">beat p{p.id}</span>
              </button>
            ))}
          </div>
        </div>
        <Slider label="Required chance of outbidding" value={`${Math.round(prob * 100)}%`} min={50} max={99} v={Math.round(prob * 100)} on={(v) => setProb(v / 100)} />
        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <Eyebrow>Compute units (thousands)</Eyebrow>
            <input type="number" min={1} max={1400} value={cuK} onChange={(e) => setCuK(Math.max(1, Number(e.target.value) || 1))} className="mt-1 w-full rounded-md border border-line-strong bg-paper px-3 py-[6px] tnum" />
          </label>
          <label className="block">
            <Eyebrow>Maximum tip budget (lamports)</Eyebrow>
            <input type="number" min={1000} step={1000} value={budget} onChange={(e) => setBudget(Math.max(1000, Number(e.target.value) || 1000))} className="mt-1 w-full rounded-md border border-line-strong bg-paper px-3 py-[6px] tnum" />
          </label>
        </div>
        <div className="rounded-md bg-panel p-4">
          <div className="text-[0.9rem] text-muted">Suggested tip range</div>
          <div className="tnum mt-1 text-[1.8rem] font-semibold text-heading">
            {fmt(low.tipLamports)} to {fmt(rec.tipLamports)} <span className="text-[1rem] font-normal text-muted">lamports</span>
          </div>
          <div className="mt-2 grid grid-cols-1 gap-x-6 sm:grid-cols-2">
            <KeyValue k="Per 1,000 compute units" v={<span className="tnum">{(rec.tipLamports / cuK).toFixed(1)}</span>} />
            <KeyValue k="Market regime" v={rec.regime} />
          </div>
        </div>
        <p className={cn("text-[0.95rem]", ok ? "text-positive" : "text-warning")}>
          Your budget of {budget.toLocaleString("en-US")} lamports is {bandText}.{" "}
          {ok
            ? `It covers the suggested tip, with room to reach about ${Math.round(reachable * 100)}% confidence.`
            : `It falls short of the suggested tip; at this budget the estimated chance of outbidding p${level} is about ${Math.round(reachable * 100)}%. Decide whether the extra bid is worth the opportunity.`}
        </p>
        <p className="text-[0.82rem] text-faint">A probabilistic estimate from live tip percentiles, not a guarantee of inclusion.</p>
      </CardBody>
    </Card>
  );
}

function Slider({ label, value, min, max, v, on }: { label: string; value: string; min: number; max: number; v: number; on: (v: number) => void }) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <Eyebrow>{label}</Eyebrow>
        <span className="tnum text-[0.95rem]">{value}</span>
      </div>
      <input type="range" min={min} max={max} value={v} onChange={(e) => on(Number(e.target.value))} className="mt-1 w-full" aria-label={label} />
    </div>
  );
}
