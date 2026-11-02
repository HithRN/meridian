"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { TipBar } from "@/core/solana/tips";
import { dateTime } from "@/lib/format";

const AXIS = { fontFamily: '"Times New Roman", Times, serif', fontSize: 11, fill: "#8c8c8c" };

const lamports = (sol: number) => Math.round(sol * 1e9);
const compactLamports = (v: number) =>
  v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(0)}k` : String(Math.round(v));

/** Landed-tip percentiles over time on a log scale, in lamports. */
export function TipHistoryChart({ bars, height = 280 }: { bars: TipBar[]; height?: number }) {
  const data = bars.map((b) => ({ t: b.t, p50: lamports(b.p50), p75: lamports(b.p75), p95: lamports(b.p95) }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: 4 }}>
        <CartesianGrid stroke="#ececec" vertical={false} />
        <XAxis dataKey="t" tickFormatter={(t) => dateTime(t).slice(5, 10)} tick={AXIS} stroke="#c8c8c8" minTickGap={56} />
        <YAxis scale="log" domain={["auto", "auto"]} tickFormatter={compactLamports} tick={AXIS} stroke="#c8c8c8" width={48} allowDataOverflow />
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0].payload as (typeof data)[number];
            return (
              <div className="border border-ink bg-paper px-3 py-2 text-xs">
                <div className="tnum text-muted">{dateTime(p.t)}</div>
                <div className="tnum">p95 {p.p95.toLocaleString("en-US")}</div>
                <div className="tnum">p75 {p.p75.toLocaleString("en-US")}</div>
                <div className="tnum">p50 {p.p50.toLocaleString("en-US")}</div>
              </div>
            );
          }}
        />
        <Line type="monotone" dataKey="p95" stroke="#0a0a0a" strokeWidth={1.4} dot={false} isAnimationActive={false} />
        <Line type="monotone" dataKey="p75" stroke="#595959" strokeWidth={1.1} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
        <Line type="monotone" dataKey="p50" stroke="#8c8c8c" strokeWidth={1} strokeDasharray="1 3" dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

/** JitoSOL position path vs the same stake without the MEV component. */
export function YieldPathChart({
  path,
  height = 260,
}: {
  path: Array<{ day: number; jitoSol: number; noMev: number }>;
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={path} margin={{ top: 8, right: 8, bottom: 4, left: 4 }}>
        <CartesianGrid stroke="#ececec" vertical={false} />
        <XAxis dataKey="day" tickFormatter={(d) => `d${d}`} tick={AXIS} stroke="#c8c8c8" minTickGap={40} />
        <YAxis domain={["auto", "auto"]} tickFormatter={(v) => Number(v).toFixed(2)} tick={AXIS} stroke="#c8c8c8" width={64} />
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0].payload as { day: number; jitoSol: number; noMev: number };
            return (
              <div className="border border-ink bg-paper px-3 py-2 text-xs">
                <div className="tnum text-muted">Day {p.day}</div>
                <div className="tnum">JitoSOL {p.jitoSol.toFixed(4)} SOL</div>
                <div className="tnum text-muted">Without MEV {p.noMev.toFixed(4)} SOL</div>
              </div>
            );
          }}
        />
        <Line type="monotone" dataKey="jitoSol" stroke="#0a0a0a" strokeWidth={1.5} dot={false} isAnimationActive={false} />
        <Line type="monotone" dataKey="noMev" stroke="#8c8c8c" strokeWidth={1.1} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
