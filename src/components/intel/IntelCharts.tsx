"use client";

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
  ReferenceLine,
  ResponsiveContainer,
  Sankey,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import type { EpochMev, FrontierPoint, ScenarioResult, ValueFlow } from "@/core/solana/intel";
import { ChartCaption } from "@/components/charts/PlainCharts";

const AXIS = { fontFamily: '"Times New Roman", Times, serif', fontSize: 12, fill: "var(--color-muted)" };
const GRID = "var(--color-chart-grid)";
const sol = (v: number) => (v >= 100 ? Math.round(v).toLocaleString("en-US") : v.toFixed(1));

function Tip({ children }: { children: React.ReactNode }) {
  return <div className="rounded-md border border-line bg-paper px-3 py-2 text-[0.85rem] shadow-sm">{children}</div>;
}

/* ------------------------------------------------------------ value flow */

const FLOW_COLORS = ["var(--color-chart-primary)", "var(--color-chart-risk)", "var(--color-chart-tertiary)", "var(--color-chart-positive)", "var(--color-chart-benchmark)"];

interface FlowNodeProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  index?: number;
  payload?: { name: string };
  values: number[];
}

function FlowNode({ x = 0, y = 0, width = 0, height = 0, index = 0, payload, values }: FlowNodeProps) {
  const left = index === 0;
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill={FLOW_COLORS[index]} rx={2} />
      <text
        x={left ? x + width + 8 : x - 8}
        y={y + height / 2 - 6}
        textAnchor={left ? "start" : "end"}
        style={{ font: '600 13px "Times New Roman", serif', fill: "var(--color-heading)" }}
      >
        {payload?.name}
      </text>
      <text
        x={left ? x + width + 8 : x - 8}
        y={y + height / 2 + 10}
        textAnchor={left ? "start" : "end"}
        style={{ font: '12px "Times New Roman", serif', fill: "var(--color-muted)" }}
      >
        {sol(values[index])} SOL
      </text>
    </g>
  );
}

export function ValueFlowSankey({ flow }: { flow: ValueFlow }) {
  const data = {
    nodes: [
      { name: "MEV tips paid by searchers" },
      { name: "Kept by validators (commission)" },
      { name: "Passed to stakers" },
      { name: "JitoSOL holders (est.)" },
      { name: "Other stakers" },
    ],
    links: [
      { source: 0, target: 1, value: Math.max(flow.validatorCommissionSol, 1e-6) },
      { source: 0, target: 2, value: Math.max(flow.stakersSol, 1e-6) },
      { source: 2, target: 3, value: Math.max(flow.jitoSolSol, 1e-6) },
      { source: 2, target: 4, value: Math.max(flow.otherStakersSol, 1e-6) },
    ],
  };
  const values = [flow.totalMevSol, flow.validatorCommissionSol, flow.stakersSol, flow.jitoSolSol, flow.otherStakersSol];

  return (
    <div>
      <ResponsiveContainer width="100%" height={300}>
        <Sankey
          data={data}
          nodePadding={36}
          nodeWidth={12}
          margin={{ top: 16, right: 190, bottom: 16, left: 12 }}
          link={{ stroke: "var(--color-chart-primary)", strokeOpacity: 0.18 }}
          node={(p: Omit<FlowNodeProps, "values">) => <FlowNode {...p} values={values} />}
        >
          <Tooltip
            content={({ active, payload }) =>
              active && payload?.length ? <Tip>{sol(Number(payload[0].value))} SOL</Tip> : null
            }
          />
        </Sankey>
      </ResponsiveContainer>
      <ChartCaption>
        Where one epoch&rsquo;s MEV went (epoch {flow.epoch}). Searchers paid {sol(flow.totalMevSol)} SOL in tips. Validators kept{" "}
        {sol(flow.validatorCommissionSol)} SOL as commission ({(flow.stakeWeightedCommission * 100).toFixed(1)}% stake-weighted), and{" "}
        {sol(flow.stakersSol)} SOL reached stakers. The JitoSOL portion is estimated from the pool&rsquo;s share of Jito stake.
      </ChartCaption>
    </div>
  );
}

/* --------------------------------------------------------- epoch history */

export function EpochMevBars({ epochs, current }: { epochs: EpochMev[]; current: number }) {
  const data = epochs.map((e) => ({ epoch: e.epoch, mev: e.totalMevSol, live: e.epoch === current }));
  const done = data.filter((d) => !d.live);
  const avg = done.reduce((s, d) => s + d.mev, 0) / Math.max(1, done.length);
  const peak = done.reduce((a, b) => (b.mev > a.mev ? b : a), done[0] ?? data[0]);
  return (
    <div>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ top: 12, right: 12, bottom: 4, left: 4 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="epoch" tick={AXIS} stroke={GRID} interval="preserveStartEnd" minTickGap={24} />
          <YAxis tickFormatter={(v) => `${Math.round(v).toLocaleString("en-US")}`} tick={AXIS} stroke={GRID} width={56} />
          <ReferenceLine y={avg} stroke="var(--color-chart-risk)" strokeDasharray="4 3" />
          <Tooltip
            cursor={{ fill: "var(--color-subtle)" }}
            content={({ active, payload }) =>
              active && payload?.length ? (
                <Tip>
                  Epoch {payload[0].payload.epoch}: {sol(Number(payload[0].payload.mev))} SOL{payload[0].payload.live ? " (in progress)" : ""}
                </Tip>
              ) : null
            }
          />
          <Bar dataKey="mev" radius={[3, 3, 0, 0]} isAnimationActive={false}>
            {data.map((d) => (
              <Cell key={d.epoch} fill={d.live ? "var(--color-chart-benchmark)" : "var(--color-chart-primary)"} fillOpacity={d.live ? 0.5 : 1} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <ChartCaption>
        Total MEV tips across Jito-Solana validators per epoch (about two days each). The dashed line is the average of{" "}
        {sol(avg)} SOL; the busiest epoch was {peak?.epoch} at {sol(peak?.mev ?? 0)} SOL. The grey bar is the epoch still in progress.
      </ChartCaption>
    </div>
  );
}

/* ------------------------------------------------------ validator frontier */

export function ValidatorFrontier({ points }: { points: FrontierPoint[] }) {
  const bam = points.filter((p) => p.group === "BAM");
  const jito = points.filter((p) => p.group === "Jito-Solana");
  const cap = (arr: FrontierPoint[]) => arr.map((p) => ({ ...p, y: Math.min(p.mevAprPct, 0.25) }));
  const median = [...points].sort((a, b) => a.mevAprPct - b.mevAprPct)[Math.floor(points.length / 2)]?.mevAprPct ?? 0;
  const stars = points.filter((p) => p.commissionPct === 0 && p.mevAprPct >= median).length;
  return (
    <div>
      <ResponsiveContainer width="100%" height={340}>
        <ScatterChart margin={{ top: 12, right: 16, bottom: 18, left: 8 }}>
          <CartesianGrid stroke={GRID} />
          <XAxis type="number" dataKey="commissionPct" name="MEV commission" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={AXIS} stroke={GRID}
            label={{ value: "MEV commission the validator keeps", position: "insideBottom", offset: -10, fill: "var(--color-muted)", fontSize: 12 }} />
          <YAxis type="number" dataKey="y" name="MEV earned" tickFormatter={(v) => `${Number(v).toFixed(2)}%`} tick={AXIS} stroke={GRID} width={56} domain={[0, "auto"]} />
          <ZAxis type="number" dataKey="stakeSol" range={[20, 600]} />
          <ReferenceLine y={median} stroke="var(--color-chart-risk)" strokeDasharray="4 3" />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as FrontierPoint;
              return (
                <Tip>
                  <div className="font-semibold">{p.vote.slice(0, 6)}…{p.vote.slice(-4)} · {p.group}</div>
                  <div>Stake: {Math.round(p.stakeSol).toLocaleString("en-US")} SOL</div>
                  <div>MEV commission: {p.commissionPct}%</div>
                  <div>MEV earned: {p.mevAprPct.toFixed(3)}% a year per SOL staked</div>
                  <div>Delegators keep: {p.stakerMevAprPct.toFixed(3)}%</div>
                  {p.directedTarget ? <div className="text-positive">StakeNet directed-stake target</div> : null}
                </Tip>
              );
            }}
          />
          <Scatter name="BAM" data={cap(bam)} fill="var(--color-chart-tertiary)" fillOpacity={0.55} isAnimationActive={false} />
          <Scatter name="Jito-Solana" data={cap(jito)} fill="var(--color-chart-secondary)" fillOpacity={0.55} isAnimationActive={false} />
        </ScatterChart>
      </ResponsiveContainer>
      <div className="mt-1 flex flex-wrap gap-5 text-[0.85rem] text-muted">
        <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-chart-tertiary opacity-70" />Running BAM ({bam.length})</span>
        <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-chart-secondary opacity-70" />Jito-Solana ({jito.length})</span>
        <span>Bubble size = stake · dashed line = median MEV earned</span>
      </div>
      <ChartCaption>
        Each bubble is a validator. Further left means it keeps less of the MEV for itself; higher means it earns more MEV per SOL
        staked. The top-left corner is the best deal for delegators: {stars} validators charge no MEV commission and earn at or above
        the median.
      </ChartCaption>
    </div>
  );
}

/* --------------------------------------------------------------- Lorenz */

export function LorenzChart({ points, gini }: { points: Array<{ x: number; y: number }>; gini: number }) {
  const data = points.map((p) => ({ x: p.x * 100, actual: p.y * 100, equal: p.x * 100 }));
  return (
    <div>
      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={data} margin={{ top: 12, right: 12, bottom: 18, left: 4 }}>
          <CartesianGrid stroke={GRID} />
          <XAxis dataKey="x" type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={AXIS} stroke={GRID}
            label={{ value: "Share of validators (smallest first)", position: "insideBottom", offset: -10, fill: "var(--color-muted)", fontSize: 12 }} />
          <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={AXIS} stroke={GRID} width={44} />
          <Area type="linear" dataKey="equal" stroke="var(--color-chart-benchmark)" strokeDasharray="4 3" fill="none" isAnimationActive={false} />
          <Area type="monotone" dataKey="actual" stroke="var(--color-chart-primary)" strokeWidth={2} fill="var(--color-info-bg)" isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
      <ChartCaption>
        If every validator had equal stake, the curve would follow the dashed line. The further it sags, the more stake sits with a
        few large validators. Gini coefficient: <strong>{gini.toFixed(2)}</strong> (0 = perfectly equal, 1 = one validator holds
        everything).
      </ChartCaption>
    </div>
  );
}

/* -------------------------------------------------------------- scenario */

export function ScenarioFan({ result, amount }: { result: ScenarioResult; amount: number }) {
  const data = result.fan.map((f) => ({
    day: f.day,
    band90: [f.p5, f.p95],
    band50: [f.p25, f.p75],
    median: f.p50,
    noMev: f.noMev,
  }));
  return (
    <div>
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={data} margin={{ top: 12, right: 12, bottom: 4, left: 4 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="day" tickFormatter={(d) => `Day ${d}`} tick={AXIS} stroke={GRID} minTickGap={48} />
          <YAxis tickFormatter={(v) => Number(v).toFixed(amount >= 100 ? 1 : 3)} tick={AXIS} stroke={GRID} width={64} domain={["auto", "auto"]} />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as { day: number; band90: number[]; median: number; noMev: number };
              return (
                <Tip>
                  <div className="font-semibold">Day {p.day}</div>
                  <div>Median: {p.median.toFixed(4)} SOL</div>
                  <div>90% range: {p.band90[0].toFixed(4)} to {p.band90[1].toFixed(4)}</div>
                  <div>Staking only: {p.noMev.toFixed(4)}</div>
                </Tip>
              );
            }}
          />
          <Area dataKey="band90" stroke="none" fill="var(--color-chart-tertiary)" fillOpacity={0.12} isAnimationActive={false} />
          <Area dataKey="band50" stroke="none" fill="var(--color-chart-tertiary)" fillOpacity={0.25} isAnimationActive={false} />
          <Line dataKey="noMev" stroke="var(--color-chart-benchmark)" strokeDasharray="4 3" dot={false} strokeWidth={1.4} isAnimationActive={false} />
          <Line dataKey="median" stroke="var(--color-chart-tertiary)" dot={false} strokeWidth={2.2} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
      <ChartCaption>
        The solid line is the middle outcome across hundreds of simulated paths; the dark band holds half of them and the light band
        nine in ten. The dashed line is the same position earning staking rewards only. The gap between them is what MEV adds.
      </ChartCaption>
    </div>
  );
}
