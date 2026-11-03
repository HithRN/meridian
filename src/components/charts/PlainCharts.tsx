"use client";

/**
 * Plain-language charts: each answers one question a non-specialist would ask
 * ("Would I have made money?", "How often is it right?") and carries a short
 * caption explaining how to read it.
 */

import * as React from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getDataset } from "@/core/data/dataset";

const AXIS = { fontFamily: '"Times New Roman", Times, serif', fontSize: 12, fill: "var(--color-muted)" };
const GRID = "var(--color-chart-grid)";
const C = {
  strategy: "var(--color-chart-tertiary)",
  benchmark: "var(--color-chart-benchmark)",
  primary: "var(--color-chart-primary)",
  secondary: "var(--color-chart-secondary)",
  positive: "var(--color-chart-positive)",
  negative: "var(--color-chart-negative)",
  risk: "var(--color-chart-risk)",
};

export interface EquityPoint {
  t: number;
  equity: number;
  drawdown: number;
}

const money = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 0 });
const monthLabel = (t: number) => new Date(t).toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });
const dayLabel = (t: number) => new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export function ChartCaption({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 text-[0.9rem] leading-relaxed text-muted">{children}</p>;
}

function Legend({ items }: { items: Array<{ color: string; label: string; dashed?: boolean }> }) {
  return (
    <div className="mt-2 flex flex-wrap gap-5 text-[0.85rem] text-muted">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-2">
          <svg width="20" height="6" aria-hidden>
            <line x1="0" y1="3" x2="20" y2="3" stroke={i.color} strokeWidth="2.5" strokeDasharray={i.dashed ? "4 3" : undefined} />
          </svg>
          {i.label}
        </span>
      ))}
    </div>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return <div className="rounded-md border border-line bg-paper px-3 py-2 text-[0.85rem] shadow-sm">{children}</div>;
}

/* ------------------------------------------------------- growth of 1,000 */

/** Strategy vs buy-and-hold, both starting from the same 1,000. */
export function GrowthChart({ equity, datasetId, version, start = 1000 }: { equity: EquityPoint[]; datasetId: string; version: string; start?: number }) {
  const data = React.useMemo(() => {
    if (!equity.length) return [];
    let closes: Map<number, number> | null = null;
    try {
      closes = new Map(getDataset(datasetId, version).bars.map((b) => [b.t, b.close]));
    } catch {
      closes = null;
    }
    const first = closes?.get(equity[0].t);
    return equity.map((p) => ({
      t: p.t,
      strategy: (start * p.equity) / equity[0].equity,
      hold: first && closes?.get(p.t) ? (start * closes.get(p.t)!) / first : undefined,
    }));
  }, [equity, datasetId, version, start]);

  if (!data.length) return null;
  const last = data[data.length - 1];
  return (
    <div>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="t" tickFormatter={dayLabel} tick={AXIS} stroke={GRID} minTickGap={60} />
          <YAxis tickFormatter={money} tick={AXIS} stroke={GRID} width={56} domain={["auto", "auto"]} />
          <ReferenceLine y={start} stroke="var(--color-line-strong)" strokeDasharray="3 3" />
          <Tooltip
            content={({ active, payload }) =>
              active && payload?.length ? (
                <Tip>
                  <div className="text-faint">{new Date(Number(payload[0].payload.t)).toISOString().slice(0, 10)}</div>
                  <div>Strategy: {money(payload[0].payload.strategy)}</div>
                  {payload[0].payload.hold ? <div>Buy and hold: {money(payload[0].payload.hold)}</div> : null}
                </Tip>
              ) : null
            }
          />
          <Line type="monotone" dataKey="hold" stroke={C.benchmark} strokeWidth={1.6} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
          <Line type="monotone" dataKey="strategy" stroke={C.strategy} strokeWidth={2.2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
      <Legend items={[{ color: C.strategy, label: "Following the model" }, { color: C.benchmark, label: "Simply buying and holding", dashed: true }]} />
      <ChartCaption>
        Start with 1,000 on the left. Following the model would have ended at <strong>{money(last.strategy)}</strong>
        {last.hold ? <>; buying and holding would have ended at <strong>{money(last.hold)}</strong></> : null}, after trading costs.
      </ChartCaption>
    </div>
  );
}

/* --------------------------------------------------------- monthly bars */

export function MonthlyReturns({ equity }: { equity: EquityPoint[] }) {
  const data = React.useMemo(() => {
    const months = new Map<string, { t: number; first: number; last: number }>();
    for (const p of equity) {
      const d = new Date(p.t);
      const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
      const m = months.get(key);
      if (!m) months.set(key, { t: p.t, first: p.equity, last: p.equity });
      else m.last = p.equity;
    }
    // Chain months so each starts where the previous ended.
    const rows = [...months.values()];
    return rows.map((m, i) => {
      const base = i === 0 ? m.first : rows[i - 1].last;
      return { t: m.t, ret: (m.last / base - 1) * 100 };
    });
  }, [equity]);
  if (data.length < 2) return null;
  const up = data.filter((d) => d.ret > 0).length;
  return (
    <div>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="t" tickFormatter={monthLabel} tick={AXIS} stroke={GRID} />
          <YAxis tickFormatter={(v) => `${Number(v).toFixed(1)}%`} tick={AXIS} stroke={GRID} width={52} />
          <ReferenceLine y={0} stroke="var(--color-line-strong)" />
          <Tooltip
            cursor={{ fill: "var(--color-subtle)" }}
            content={({ active, payload }) =>
              active && payload?.length ? (
                <Tip>
                  {monthLabel(Number(payload[0].payload.t))}: {Number(payload[0].payload.ret).toFixed(2)}%
                </Tip>
              ) : null
            }
          />
          <Bar dataKey="ret" radius={[3, 3, 0, 0]} isAnimationActive={false}>
            {data.map((d) => (
              <Cell key={d.t} fill={d.ret >= 0 ? C.positive : C.negative} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <ChartCaption>
        Each bar is one month. Green months made money, red months lost money: {up} of {data.length} months were positive.
      </ChartCaption>
    </div>
  );
}

/* ------------------------------------------------------------ drawdown */

export function DrawdownChart({ equity }: { equity: EquityPoint[] }) {
  const data = equity.map((p) => ({ t: p.t, dd: p.drawdown * 100 }));
  if (!data.length) return null;
  const worst = Math.min(...data.map((d) => d.dd));
  return (
    <div>
      <ResponsiveContainer width="100%" height={180}>
        <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="t" tickFormatter={dayLabel} tick={AXIS} stroke={GRID} minTickGap={60} />
          <YAxis tickFormatter={(v) => `${Number(v).toFixed(0)}%`} tick={AXIS} stroke={GRID} width={44} domain={["auto", 0]} />
          <Area type="monotone" dataKey="dd" stroke={C.negative} fill="var(--color-negative-bg)" strokeWidth={1.4} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
      <ChartCaption>
        How far the account sat below its previous high at each moment. The deepest dip was <strong>{worst.toFixed(1)}%</strong>; smaller
        and shorter dips mean a smoother ride.
      </ChartCaption>
    </div>
  );
}

/* ------------------------------------------------- accuracy vs coin flip */

export function AccuracyBars({ models }: { models: Array<{ label: string; accuracy: number; best?: boolean }> }) {
  const data = models.map((m) => ({ ...m, pct: m.accuracy * 100 }));
  return (
    <div>
      <ResponsiveContainer width="100%" height={56 + data.length * 40}>
        <BarChart data={data} layout="vertical" margin={{ top: 8, right: 40, bottom: 4, left: 4 }}>
          <CartesianGrid stroke={GRID} horizontal={false} />
          <XAxis type="number" domain={[40, 60]} tickFormatter={(v) => `${v}%`} tick={AXIS} stroke={GRID} />
          <YAxis type="category" dataKey="label" tick={AXIS} stroke={GRID} width={150} />
          <ReferenceLine x={50} stroke={C.risk} strokeDasharray="4 3" label={{ value: "Coin flip", position: "top", fill: "var(--color-muted)", fontSize: 12 }} />
          <Bar dataKey="pct" radius={[0, 3, 3, 0]} barSize={18} isAnimationActive={false} label={{ position: "right", formatter: (v: unknown) => `${Number(v).toFixed(1)}%`, fill: "var(--color-ink)", fontSize: 12 }}>
            {data.map((d) => (
              <Cell key={d.label} fill={d.best ? C.strategy : C.benchmark} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <ChartCaption>
        How often each model called the next hour&rsquo;s direction correctly. Anything to the right of the coin-flip line beats guessing;
        in markets, even a few points is meaningful.
      </ChartCaption>
    </div>
  );
}

/* ------------------------------------------------- result with its range */

export function RangeChart({ rows, unit = "" }: { rows: Array<{ label: string; value: number; low: number; high: number }>; unit?: string }) {
  const lo = Math.min(0, ...rows.map((r) => r.low));
  const hi = Math.max(0, ...rows.map((r) => r.high));
  const span = hi - lo || 1;
  const x = (v: number) => `${((v - lo) / span) * 100}%`;
  return (
    <div>
      <div className="space-y-4">
        {rows.map((r) => (
          <div key={r.label} className="grid grid-cols-[10rem_1fr_4rem] items-center gap-3 text-[0.92rem]">
            <span className="truncate text-ink">{r.label}</span>
            <div className="relative h-6">
              <div className="absolute inset-y-[11px] left-0 right-0 bg-divider" />
              <div className="absolute inset-y-0 w-px bg-line-strong" style={{ left: x(0) }} title="Zero" />
              <div
                className="absolute inset-y-[8px] rounded-full"
                style={{ left: x(r.low), width: `calc(${x(r.high)} - ${x(r.low)})`, background: r.low > 0 ? "var(--color-positive-bg)" : "var(--color-neutral-bg)", border: `1px solid ${r.low > 0 ? "var(--color-chart-positive)" : "var(--color-chart-benchmark)"}` }}
              />
              <div className="absolute top-[5px] h-[14px] w-[14px] -translate-x-1/2 rounded-full border-2 border-paper" style={{ left: x(r.value), background: r.value >= 0 ? C.strategy : C.negative }} />
            </div>
            <span className="tnum text-right">{r.value.toFixed(2)}{unit}</span>
          </div>
        ))}
      </div>
      <ChartCaption>
        The dot is the measured result; the bar is the range it could plausibly fall in. If the bar crosses the zero line, the result
        is not yet distinguishable from luck, which is why those models are not approved.
      </ChartCaption>
    </div>
  );
}

/* ----------------------------------------------------- price of certainty */

export function CertaintyCurve({ points, current }: { points: Array<{ confidence: number; lamports: number }>; current: { confidence: number; lamports: number } }) {
  return (
    <div>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={points} margin={{ top: 12, right: 16, bottom: 4, left: 4 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="confidence" type="number" domain={[50, 97]} tickFormatter={(v) => `${v}%`} tick={AXIS} stroke={GRID} />
          <YAxis tickFormatter={(v) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${Math.round(v / 1e3)}k` : String(v))} tick={AXIS} stroke={GRID} width={52} />
          <Tooltip
            content={({ active, payload }) =>
              active && payload?.length ? (
                <Tip>
                  {payload[0].payload.confidence}% sure: {Number(payload[0].payload.lamports).toLocaleString("en-US")} lamports
                </Tip>
              ) : null
            }
          />
          <Line type="monotone" dataKey="lamports" stroke={C.primary} strokeWidth={2.2} dot={false} isAnimationActive={false} />
          <ReferenceDot x={current.confidence} y={current.lamports} r={6} fill={C.strategy} stroke="#fff" strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
      <ChartCaption>
        The price of certainty: moving right means being more sure the bundle outbids the competition, and the line shows the tip that
        takes. The dot is your current choice. The curve bends upward, so the last few percent of confidence cost the most.
      </ChartCaption>
    </div>
  );
}

/* --------------------------------------------------- how often rules work */

export function ReliabilityBars({ target, rows }: { target: number; rows: Array<{ label: string; value: number; highlight?: boolean }> }) {
  const data = rows.map((r) => ({ ...r, pct: r.value * 100 }));
  return (
    <div>
      <ResponsiveContainer width="100%" height={56 + data.length * 40}>
        <BarChart data={data} layout="vertical" margin={{ top: 8, right: 44, bottom: 4, left: 4 }}>
          <CartesianGrid stroke={GRID} horizontal={false} />
          <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={AXIS} stroke={GRID} />
          <YAxis type="category" dataKey="label" tick={AXIS} stroke={GRID} width={170} />
          <ReferenceLine x={target * 100} stroke={C.risk} strokeDasharray="4 3" label={{ value: `Target ${Math.round(target * 100)}%`, position: "top", fill: "var(--color-muted)", fontSize: 12 }} />
          <Bar dataKey="pct" radius={[0, 3, 3, 0]} barSize={18} isAnimationActive={false} label={{ position: "right", formatter: (v: unknown) => `${Number(v).toFixed(0)}%`, fill: "var(--color-ink)", fontSize: 12 }}>
            {data.map((d) => (
              <Cell key={d.label} fill={d.highlight ? C.strategy : C.benchmark} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <ChartCaption>
        How often each way of choosing a tip actually outbid the competition, tested hour by hour on data it had not seen. A reliable
        method lands on the target line, including when the network is busy.
      </ChartCaption>
    </div>
  );
}

/* ------------------------------------------------------- yield breakdown */

export function YieldDonut({ apy, mevApy }: { apy: number; mevApy: number }) {
  const data = [
    { name: "Staking rewards", value: Math.max(0, apy - mevApy), color: C.primary },
    { name: "MEV rewards", value: mevApy, color: C.strategy },
  ];
  return (
    <div className="flex flex-wrap items-center gap-6">
      <div className="relative h-[180px] w-[180px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" innerRadius={58} outerRadius={84} startAngle={90} endAngle={-270} stroke="var(--color-paper)" strokeWidth={2} isAnimationActive={false}>
              {data.map((d) => (
                <Cell key={d.name} fill={d.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="tnum text-[1.5rem] font-semibold text-heading">{(apy * 100).toFixed(2)}%</span>
          <span className="text-[0.8rem] text-faint">per year</span>
        </div>
      </div>
      <div className="min-w-[14rem] flex-1 space-y-3">
        {data.map((d) => (
          <div key={d.name} className="flex items-center justify-between gap-4 border-b border-divider pb-2">
            <span className="inline-flex items-center gap-2">
              <span className="h-3 w-3 rounded-sm" style={{ background: d.color }} />
              {d.name}
            </span>
            <span className="tnum font-semibold">{(d.value * 100).toFixed(2)}%</span>
          </div>
        ))}
        <ChartCaption>
          Where the yield comes from. Staking rewards are paid by the network; MEV rewards are tips searchers pay, shared with stakers by
          Jito-Solana validators.
        </ChartCaption>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------- landing gauge */

export function ProbabilityGauge({ p, label }: { p: number; label: string }) {
  const angle = Math.PI * (1 - Math.min(1, Math.max(0, p)));
  const r = 70, cx = 90, cy = 86;
  const x = cx + r * Math.cos(angle), y = cy - r * Math.sin(angle);
  const color = p >= 0.7 ? C.positive : p >= 0.4 ? C.risk : C.negative;
  return (
    <svg viewBox="0 0 180 100" className="h-[110px] w-[200px]" role="img" aria-label={`${label}: ${Math.round(p * 100)}%`}>
      <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke="var(--color-divider)" strokeWidth="14" strokeLinecap="round" />
      <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${x} ${y}`} fill="none" stroke={color} strokeWidth="14" strokeLinecap="round" />
      <text x={cx} y={cy - 12} textAnchor="middle" style={{ font: '600 30px "Times New Roman", serif', fill: "var(--color-heading)" }}>
        {Math.round(p * 100)}%
      </text>
      <text x={cx - r} y={cy + 14} textAnchor="middle" style={{ font: '12px "Times New Roman", serif', fill: "var(--color-faint)" }}>0</text>
      <text x={cx + r} y={cy + 14} textAnchor="middle" style={{ font: '12px "Times New Roman", serif', fill: "var(--color-faint)" }}>100</text>
    </svg>
  );
}

/* ------------------------------------------------ landing chance vs tip */

export function TipResponseCurve({ points, currentTip, target, minTip }: { points: Array<{ multiple: number; p: number }>; currentTip: number; target: number; minTip: number | null }) {
  const current = points.reduce((a, b) => (Math.abs(b.multiple - currentTip) < Math.abs(a.multiple - currentTip) ? b : a), points[0]);
  return (
    <div>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={points} margin={{ top: 12, right: 16, bottom: 4, left: 4 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="multiple" type="number" scale="log" domain={["dataMin", "dataMax"]} ticks={[0.25, 0.5, 1, 2, 4, 8, 16, 32, 64]} tickFormatter={(v) => `×${v}`} tick={AXIS} stroke={GRID} />
          <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={AXIS} stroke={GRID} width={44} />
          <ReferenceLine y={target * 100} stroke={C.risk} strokeDasharray="4 3" label={{ value: `Target ${Math.round(target * 100)}%`, position: "insideTopLeft", fill: "var(--color-muted)", fontSize: 12 }} />
          {minTip !== null ? <ReferenceLine x={minTip} stroke={C.strategy} strokeDasharray="2 3" /> : null}
          <Tooltip
            content={({ active, payload }) =>
              active && payload?.length ? (
                <Tip>
                  Tip ×{Number(payload[0].payload.multiple).toFixed(2)} the median: {Number(payload[0].payload.p).toFixed(0)}% chance to land
                </Tip>
              ) : null
            }
          />
          <Line type="monotone" dataKey="p" stroke={C.primary} strokeWidth={2.2} dot={false} isAnimationActive={false} />
          <ReferenceDot x={current.multiple} y={current.p} r={6} fill={C.strategy} stroke="#fff" strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
      <ChartCaption>
        What paying more buys, with everything else about this bundle unchanged. The dot is the current tip. Where the line flattens
        below the target, a bigger tip will not help: something else is holding the bundle back.
      </ChartCaption>
    </div>
  );
}
