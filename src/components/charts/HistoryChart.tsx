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

const AXIS = { fontFamily: '"Times New Roman", Times, serif', fontSize: 11, fill: "#8c8c8c" };

export type XFormat = "hour" | "date" | "index";

export interface Series {
  key: string;
  label: string;
  dashed?: boolean;
}

function formatX(kind: XFormat, v: number): string {
  if (kind === "hour") return new Date(v).toISOString().slice(11, 16);
  if (kind === "date") return new Date(v).toISOString().slice(5, 10);
  return String(v);
}

/**
 * Monochrome multi-line chart. Formatting is chosen by a string enum rather
 * than a function prop so the component can be used directly from Server
 * Components (functions cannot cross the RSC boundary).
 */
export function HistoryChart({
  data,
  series,
  height = 240,
  xFormat = "hour",
}: {
  data: Array<Record<string, number>>;
  series: Series[];
  height?: number;
  xFormat?: XFormat;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: 4 }}>
        <CartesianGrid stroke="#ececec" vertical={false} />
        <XAxis
          dataKey="t"
          tick={AXIS}
          stroke="#c8c8c8"
          minTickGap={48}
          tickFormatter={(v: number) => formatX(xFormat, v)}
        />
        <YAxis tick={AXIS} stroke="#c8c8c8" width={44} />
        <Tooltip content={<MonoTooltip series={series} xFormat={xFormat} />} />
        {series.map((s) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            stroke="#0a0a0a"
            strokeWidth={1.4}
            strokeDasharray={s.dashed ? "4 3" : undefined}
            dot={false}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

interface TooltipProps {
  active?: boolean;
  label?: number;
  payload?: Array<{ value: number; dataKey: string }>;
  series: Series[];
  xFormat: XFormat;
}

function MonoTooltip({ active, label, payload, series, xFormat }: TooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="border border-ink bg-paper px-3 py-2 text-xs">
      {label !== undefined ? (
        <div className="tnum mb-1 text-muted">{formatX(xFormat, label)}</div>
      ) : null}
      {payload.map((p) => {
        const s = series.find((x) => x.key === p.dataKey);
        return (
          <div key={p.dataKey} className="tnum flex items-center gap-2">
            <span
              aria-hidden
              className="inline-block w-4 border-t border-ink"
              style={{ borderStyle: s?.dashed ? "dashed" : "solid" }}
            />
            <span>
              {s?.label ?? p.dataKey}: {p.value}
            </span>
          </div>
        );
      })}
    </div>
  );
}
