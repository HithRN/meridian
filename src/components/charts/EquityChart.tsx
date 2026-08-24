"use client";

import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { dateShort, pct } from "@/lib/format";

export interface EquityPointLite {
  t: number;
  equity: number;
  drawdown: number;
}

const AXIS = { fontFamily: '"Times New Roman", Times, serif', fontSize: 11, fill: "#8c8c8c" };

export function EquityChart({ data, height = 280 }: { data: EquityPointLite[]; height?: number }) {
  if (!data || data.length === 0) {
    return <Empty />;
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: 4 }}>
        <CartesianGrid stroke="#ececec" vertical={false} />
        <defs>
          <pattern id="ddhatch" width="4" height="4" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
            <rect width="4" height="4" fill="#f2f2f2" />
            <line x1="0" y1="0" x2="0" y2="4" stroke="#dcdcdc" strokeWidth="1" />
          </pattern>
        </defs>
        <XAxis
          dataKey="t"
          tickFormatter={(t) => dateShort(t).slice(5)}
          tick={AXIS}
          stroke="#c8c8c8"
          minTickGap={48}
        />
        <YAxis
          yAxisId="equity"
          tickFormatter={(v) => v.toFixed(2)}
          tick={AXIS}
          stroke="#c8c8c8"
          width={44}
          domain={["auto", "auto"]}
        />
        <YAxis yAxisId="dd" orientation="right" hide domain={[-1, 0]} />
        <Tooltip content={<EquityTooltip />} />
        <Area
          yAxisId="dd"
          type="monotone"
          dataKey="drawdown"
          stroke="none"
          fill="url(#ddhatch)"
          isAnimationActive={false}
        />
        <Line
          yAxisId="equity"
          type="monotone"
          dataKey="equity"
          stroke="#0a0a0a"
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ payload: EquityPointLite }>;
}

function EquityTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="border border-ink bg-paper px-3 py-2 text-xs">
      <div className="tnum text-muted">{dateShort(p.t)}</div>
      <div className="tnum">Equity {p.equity.toFixed(4)}</div>
      <div className="tnum text-muted">Drawdown {pct(p.drawdown)}</div>
    </div>
  );
}

function Empty() {
  return (
    <div className="flex h-40 items-center justify-center border border-dashed border-line text-sm text-faint">
      No equity data
    </div>
  );
}
