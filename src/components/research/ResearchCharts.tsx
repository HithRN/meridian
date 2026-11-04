"use client";

/**
 * Renders the chart specs a market research report carries. A report is data, so
 * the same charts can be saved, reopened and compared. Hover any mark for values,
 * click a legend entry to hide a series, and open "See the numbers" for a table.
 */

import * as React from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { formatPrice, niceTicks } from "@/core/market/book";
import { cn } from "@/lib/cn";
import type { BarChartSpec, ChartSeries, ChartSpec, FanChartSpec, HistogramChartSpec, LineChartSpec, MatrixChartSpec, ScatterChartSpec, ValueFormat } from "@/core/market/research/types";

const AXIS = { fontFamily: '"Times New Roman", Times, serif', fontSize: 12, fill: "var(--color-muted)" };
const GRID = "var(--color-chart-grid)";
/** Categorical order, validated for colour-blind separation against the page surface. */
const SLOTS = ["var(--color-series-1)", "var(--color-series-2)", "var(--color-series-3)", "var(--color-series-4)", "var(--color-series-5)"];

export function seriesColor(c: ChartSeries["color"]): string {
  if (c === "benchmark") return "var(--color-chart-benchmark)";
  if (c === "up") return "var(--color-chart-positive)";
  if (c === "down") return "var(--color-chart-negative)";
  return SLOTS[c % SLOTS.length];
}

export function formatValue(v: number | null | undefined, f: ValueFormat): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "n/a";
  switch (f) {
    case "price":
      return `$${formatPrice(v)}`;
    case "percent":
      return `${(v * 100).toFixed(Math.abs(v) < 0.01 ? 2 : 1)}%`;
    case "percent0":
      return `${(v * 100).toFixed(0)}%`;
    case "index":
      return v.toFixed(1);
    case "bps":
      return `${v.toFixed(1)} bps`;
    case "corr":
      return v.toFixed(2);
    case "sol":
      return `${v.toLocaleString("en-US", { maximumFractionDigits: 0 })} SOL`;
    default:
      return v.toFixed(3);
  }
}

/** Round axis labels that cover the data, instead of whatever divides the range evenly. */
function roundScale(values: ReadonlyArray<number | null | undefined>): { domain: [number, number]; ticks: number[] } {
  const finite = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (!finite.length) return { domain: [0, 1], ticks: [0, 1] };
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  const pad = (max - min || Math.abs(max) || 1) * 0.04;
  const inner = niceTicks(min - pad, max + pad, 5);
  const step = inner.length > 1 ? inner[1] - inner[0] : pad;
  const ticks = [...inner];
  if (ticks[0] > min) ticks.unshift(Number((ticks[0] - step).toPrecision(12)));
  if (ticks[ticks.length - 1] < max) ticks.push(Number((ticks[ticks.length - 1] + step).toPrecision(12)));
  return { domain: [ticks[0], ticks[ticks.length - 1]], ticks };
}

/** Axis labels drop the decimals a round tick does not need. */
function formatTick(v: number, f: ValueFormat): string {
  if (f === "percent") return `${Number((v * 100).toFixed(2))}%`;
  if (f === "bps") return `${Number(v.toFixed(2))} bps`;
  if (f === "index") return String(Number(v.toFixed(1)));
  return formatValue(v, f);
}

function timeFormatter(points: ReadonlyArray<Record<string, unknown>>, key: string) {
  const first = Number(points[0]?.[key]);
  const last = Number(points[points.length - 1]?.[key]);
  const span = last - first;
  return (t: number) => {
    const d = new Date(t);
    if (span < 3 * 86_400_000) return d.toLocaleString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" });
    if (span > 300 * 86_400_000) return d.toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  };
}

const fullTime = (t: number) => `${new Date(t).toISOString().slice(0, 16).replace("T", " ")} UTC`;

function Tip({ children }: { children: React.ReactNode }) {
  return <div className="rounded-md border border-line bg-paper px-3 py-2 text-[0.88rem] text-ink shadow-[0_4px_14px_rgba(24,54,80,0.1)]">{children}</div>;
}

function Swatch({ color, dashed }: { color: string; dashed?: boolean }) {
  return (
    <svg width="20" height="6" aria-hidden>
      <line x1="0" y1="3" x2="20" y2="3" stroke={color} strokeWidth="2.5" strokeDasharray={dashed ? "4 3" : undefined} />
    </svg>
  );
}

/* --------------------------------------------------------------------- lines */

function LineView({ spec }: { spec: LineChartSpec }) {
  const [hidden, setHidden] = React.useState<Set<string>>(new Set());
  const xKey = spec.x === "time" ? "t" : "x";
  const tickX = spec.x === "time" ? timeFormatter(spec.points, "t") : undefined;
  const toggle = (key: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else if (spec.series.length - next.size > 1) next.add(key);
      return next;
    });
  const visible = spec.series.filter((s) => !hidden.has(s.key));
  const Chart = spec.area ? AreaChart : LineChart;
  const scale = roundScale(spec.points.flatMap((p) => visible.map((s) => p[s.key] as number | null)));

  return (
    <div>
      <ResponsiveContainer width="100%" height={280}>
        <Chart data={spec.points} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey={xKey} type={spec.x === "time" ? "number" : "category"} domain={spec.x === "time" ? ["dataMin", "dataMax"] : undefined} scale={spec.x === "time" ? "time" : undefined} tickFormatter={tickX} tick={AXIS} stroke={GRID} minTickGap={50} />
          <YAxis tickFormatter={(v: number) => formatTick(v, spec.format)} tick={AXIS} stroke={GRID} width={68} domain={scale.domain} ticks={scale.ticks} allowDataOverflow />
          {spec.guides?.map((g) => (
            <ReferenceLine key={g.value} y={g.value} stroke="var(--color-line-strong)" strokeDasharray="4 3" label={g.label ? { value: g.label, position: "insideTopRight", fill: "var(--color-muted)", fontSize: 12, fontFamily: AXIS.fontFamily } : undefined} />
          ))}
          <Tooltip
            content={({ active, payload }) =>
              active && payload?.length ? (
                <Tip>
                  <div className="text-faint">{spec.x === "time" ? fullTime(Number(payload[0].payload.t)) : String(payload[0].payload.x)}</div>
                  {visible.map((s) => (
                    <div key={s.key} className="tnum flex items-center gap-2">
                      <Swatch color={seriesColor(s.color)} dashed={s.dashed} />
                      {s.label}: {formatValue(payload[0].payload[s.key] as number, spec.format)}
                    </div>
                  ))}
                </Tip>
              ) : null
            }
          />
          {visible.map((s) =>
            spec.area ? (
              <Area key={s.key} type="monotone" dataKey={s.key} stroke={seriesColor(s.color)} fill={seriesColor(s.color)} fillOpacity={0.16} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />
            ) : (
              <Line key={s.key} type="monotone" dataKey={s.key} stroke={seriesColor(s.color)} strokeWidth={2} strokeDasharray={s.dashed ? "5 4" : undefined} dot={spec.x === "category" ? { r: 3 } : false} isAnimationActive={false} connectNulls={spec.x === "time"} />
            ),
          )}
        </Chart>
      </ResponsiveContainer>
      {spec.series.length > 1 ? (
        <div className="mt-2 flex flex-wrap gap-2 text-[0.88rem]">
          {spec.series.map((s) => {
            const off = hidden.has(s.key);
            return (
              <button key={s.key} onClick={() => toggle(s.key)} aria-pressed={!off} title={off ? "Show this line" : "Hide this line"} className={cn("inline-flex items-center gap-2 rounded-full border px-3 py-[2px] transition-colors", off ? "border-line text-faint line-through" : "border-line-strong text-ink hover:bg-subtle")}>
                <Swatch color={off ? "var(--color-line-strong)" : seriesColor(s.color)} dashed={s.dashed} />
                {s.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

/* ----------------------------------------------------------------------- fan */

function FanView({ spec }: { spec: FanChartSpec }) {
  const data = spec.points.map((p) => ({ ...p, band90: [p.p5, p.p95], band50: [p.p25, p.p75] }));
  const scale = roundScale(spec.points.flatMap((p) => [p.p5, p.p95]));
  return (
    <div>
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="day" tick={AXIS} stroke={GRID} tickFormatter={(d: number) => `Day ${d}`} minTickGap={40} />
          <YAxis tick={AXIS} stroke={GRID} width={68} domain={scale.domain} ticks={scale.ticks} allowDataOverflow tickFormatter={(v: number) => formatTick(v, spec.format)} />
          <Tooltip
            content={({ active, payload }) => {
              const p = payload?.[0]?.payload as FanChartSpec["points"][number] | undefined;
              return active && p ? (
                <Tip>
                  <div className="text-faint">Day {p.day}</div>
                  <div className="tnum">90% between {formatValue(p.p5, spec.format)} and {formatValue(p.p95, spec.format)}</div>
                  <div className="tnum">50% between {formatValue(p.p25, spec.format)} and {formatValue(p.p75, spec.format)}</div>
                </Tip>
              ) : null;
            }}
          />
          <Area type="monotone" dataKey="band90" stroke="none" fill="var(--color-series-1)" fillOpacity={0.14} isAnimationActive={false} />
          <Area type="monotone" dataKey="band50" stroke="none" fill="var(--color-series-1)" fillOpacity={0.28} isAnimationActive={false} />
          <Line type="monotone" dataKey="p50" stroke="var(--color-series-1)" strokeWidth={2} dot={false} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ---------------------------------------------------------------------- bars */

const TONE = { up: "var(--color-chart-positive)", down: "var(--color-chart-negative)", highlight: "var(--color-series-1)", muted: "var(--color-chart-benchmark)" };

function BarView({ spec }: { spec: BarChartSpec }) {
  const tickX = spec.x === "time" ? timeFormatter(spec.points as unknown as Array<Record<string, unknown>>, "x") : undefined;
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={spec.points} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="x" tick={AXIS} stroke={GRID} tickFormatter={tickX} minTickGap={spec.x === "time" ? 50 : 8} />
        <YAxis tick={AXIS} stroke={GRID} width={68} tickFormatter={(v: number) => formatValue(v, spec.format)} />
        <ReferenceLine y={0} stroke="var(--color-line-strong)" />
        {spec.guides?.map((g) => (
          <ReferenceLine key={g.value} y={g.value} stroke="var(--color-line-strong)" strokeDasharray="4 3" label={g.label ? { value: g.label, position: "insideTopRight", fill: "var(--color-muted)", fontSize: 12, fontFamily: AXIS.fontFamily } : undefined} />
        ))}
        <Tooltip
          cursor={{ fill: "var(--color-subtle)" }}
          content={({ active, payload }) => {
            const p = payload?.[0]?.payload as BarChartSpec["points"][number] | undefined;
            return active && p ? (
              <Tip>
                <div className="text-faint">{spec.x === "time" ? new Date(Number(p.x)).toISOString().slice(0, 10) : p.x}</div>
                <div className="tnum">{formatValue(p.value, spec.format)}</div>
              </Tip>
            ) : null;
          }}
        />
        <Bar dataKey="value" radius={[3, 3, 0, 0]} isAnimationActive={false}>
          {spec.points.map((p, i) => (
            <Cell key={i} fill={TONE[p.tone ?? "highlight"]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ----------------------------------------------------------------- histogram */

function HistogramView({ spec }: { spec: HistogramChartSpec }) {
  return (
    <div>
      <ResponsiveContainer width="100%" height={270}>
        <ComposedChart data={spec.bins} margin={{ top: 8, right: 12, bottom: 4, left: 4 }} barCategoryGap={1}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="mid" tick={AXIS} stroke={GRID} tickFormatter={(v: number) => `${v.toFixed(1)}%`} minTickGap={36} />
          <YAxis tick={AXIS} stroke={GRID} width={48} />
          <Tooltip
            cursor={{ fill: "var(--color-subtle)" }}
            content={({ active, payload }) => {
              const b = payload?.[0]?.payload as HistogramChartSpec["bins"][number] | undefined;
              return active && b ? (
                <Tip>
                  <div className="text-faint tnum">{b.from.toFixed(2)}% to {b.to.toFixed(2)}%</div>
                  <div className="tnum">{b.count} candles seen</div>
                  <div className="tnum">{b.normal.toFixed(1)} on a bell curve</div>
                </Tip>
              ) : null;
            }}
          />
          <Bar dataKey="count" fill="var(--color-series-1)" radius={[2, 2, 0, 0]} isAnimationActive={false} />
          <Line type="monotone" dataKey="normal" stroke="var(--color-series-2)" strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
      <div className="mt-2 flex flex-wrap gap-5 text-[0.88rem] text-muted">
        <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-[2px] bg-[var(--color-series-1)]" aria-hidden />What happened</span>
        <span className="inline-flex items-center gap-2"><Swatch color="var(--color-series-2)" dashed />Textbook bell curve</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- scatter */

function ScatterView({ spec }: { spec: ScatterChartSpec }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <ScatterChart margin={{ top: 8, right: 12, bottom: 24, left: 8 }}>
        <CartesianGrid stroke={GRID} />
        <XAxis dataKey="x" type="number" name={spec.xLabel} domain={["auto", "auto"]} tick={AXIS} stroke={GRID} tickFormatter={(v: number) => formatValue(v, spec.xFormat)} label={{ value: spec.xLabel, position: "bottom", offset: 6, fill: "var(--color-muted)", fontSize: 13, fontFamily: AXIS.fontFamily }} />
        <YAxis dataKey="y" type="number" name={spec.yLabel} domain={["auto", "auto"]} tick={AXIS} stroke={GRID} width={78} tickFormatter={(v: number) => formatValue(v, spec.yFormat)} />
        <ZAxis range={[70, 70]} />
        {spec.fit?.length === 2 ? <ReferenceLine segment={[spec.fit[0], spec.fit[1]]} stroke="var(--color-series-2)" strokeDasharray="5 4" strokeWidth={2} ifOverflow="extendDomain" /> : null}
        <Tooltip
          cursor={{ strokeDasharray: "3 3" }}
          content={({ active, payload }) => {
            const p = payload?.[0]?.payload as ScatterChartSpec["points"][number] | undefined;
            return active && p ? (
              <Tip>
                {p.label ? <div className="text-faint">{p.label}</div> : null}
                <div className="tnum">{spec.xLabel}: {formatValue(p.x, spec.xFormat)}</div>
                <div className="tnum">{spec.yLabel}: {formatValue(p.y, spec.yFormat)}</div>
              </Tip>
            ) : null;
          }}
        />
        <Scatter data={spec.points} fill="var(--color-series-1)" stroke="var(--color-paper)" strokeWidth={1.5} isAnimationActive={false} />
      </ScatterChart>
    </ResponsiveContainer>
  );
}

/* -------------------------------------------------------------------- matrix */

function MatrixView({ spec }: { spec: MatrixChartSpec }) {
  return (
    <div className="overflow-x-auto">
      <table className="border-separate border-spacing-[2px] text-[0.92rem]">
        <thead>
          <tr>
            <th />
            {spec.labels.map((l) => (
              <th key={l} className="px-3 py-1 text-center font-semibold text-muted">{l}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {spec.values.map((row, i) => (
            <tr key={spec.labels[i]}>
              <th className="px-3 py-1 text-left font-semibold text-muted">{spec.labels[i]}</th>
              {row.map((v, j) => {
                const strength = Math.max(0, Math.min(1, Math.abs(v)));
                return (
                  <td key={j} title={`${spec.labels[i]} and ${spec.labels[j]}: ${v.toFixed(2)}`} className="tnum min-w-16 rounded-[4px] px-3 py-2 text-center" style={{ background: `color-mix(in srgb, var(--color-series-1) ${Math.round(strength * 85)}%, var(--color-paper))`, color: strength > 0.55 ? "#fff" : "var(--color-ink)" }}>
                    {v.toFixed(2)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* --------------------------------------------------------------- data tables */

function chartTable(spec: ChartSpec): { columns: string[]; rows: string[][] } {
  switch (spec.type) {
    case "line":
      return {
        columns: [spec.x === "time" ? "Time (UTC)" : "Size", ...spec.series.map((s) => s.label)],
        rows: spec.points.map((p) => [spec.x === "time" ? new Date(Number(p.t)).toISOString().slice(0, 16).replace("T", " ") : String(p.x), ...spec.series.map((s) => formatValue(p[s.key] as number | null, spec.format))]),
      };
    case "fan":
      return { columns: ["Day", "5%", "25%", "50%", "75%", "95%"], rows: spec.points.map((p) => [String(p.day), ...[p.p5, p.p25, p.p50, p.p75, p.p95].map((v) => formatValue(v, spec.format))]) };
    case "bar":
      return { columns: [spec.x === "time" ? "Date" : "Group", "Value"], rows: spec.points.map((p) => [spec.x === "time" ? new Date(Number(p.x)).toISOString().slice(0, 10) : String(p.x), formatValue(p.value, spec.format)]) };
    case "histogram":
      return { columns: ["From %", "To %", "Seen", "Bell curve"], rows: spec.bins.map((b) => [b.from.toFixed(2), b.to.toFixed(2), String(b.count), b.normal.toFixed(1)]) };
    case "scatter":
      return { columns: ["Point", spec.xLabel, spec.yLabel], rows: spec.points.map((p) => [p.label ?? "", formatValue(p.x, spec.xFormat), formatValue(p.y, spec.yFormat)]) };
    case "matrix":
      return { columns: ["", ...spec.labels], rows: spec.values.map((r, i) => [spec.labels[i], ...r.map((v) => v.toFixed(2))]) };
  }
}

function downloadCsv(name: string, table: { columns: string[]; rows: string[][] }) {
  const cell = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const csv = [table.columns, ...table.rows].map((r) => r.map(cell).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const MAX_ROWS = 60;

function NumbersTable({ spec }: { spec: ChartSpec }) {
  const table = chartTable(spec);
  const rows = table.rows.length > MAX_ROWS ? table.rows.slice(-MAX_ROWS) : table.rows;
  return (
    <details className="mt-3 print:hidden">
      <summary className="cursor-pointer text-[0.9rem] text-link">See the numbers</summary>
      <div className="mt-2 max-h-72 overflow-auto rounded-md border border-line">
        <table className="w-full border-collapse text-[0.88rem]">
          <thead className="sticky top-0 bg-panel">
            <tr>{table.columns.map((c) => <th key={c} className="px-3 py-1 text-left font-semibold text-faint">{c}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-divider">
                {r.map((c, j) => <td key={j} className="tnum px-3 py-1 text-ink">{c}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-2 flex items-center justify-between text-[0.84rem] text-faint">
        <span>{table.rows.length > MAX_ROWS ? `Latest ${MAX_ROWS} of ${table.rows.length} rows.` : `${table.rows.length} rows.`}</span>
        <button onClick={() => downloadCsv(spec.title, table)} className="text-link underline-offset-2 hover:underline">Download CSV</button>
      </div>
    </details>
  );
}

export function ResearchChart({ spec }: { spec: ChartSpec }) {
  return (
    <figure className="m-0">
      <figcaption className="mb-2 text-[1.02rem] font-semibold text-heading">{spec.title}</figcaption>
      {spec.type === "line" ? <LineView spec={spec} /> : null}
      {spec.type === "fan" ? <FanView spec={spec} /> : null}
      {spec.type === "bar" ? <BarView spec={spec} /> : null}
      {spec.type === "histogram" ? <HistogramView spec={spec} /> : null}
      {spec.type === "scatter" ? <ScatterView spec={spec} /> : null}
      {spec.type === "matrix" ? <MatrixView spec={spec} /> : null}
      <p className="mt-2 text-[0.92rem] leading-relaxed text-muted">{spec.caption}</p>
      <NumbersTable spec={spec} />
    </figure>
  );
}
