"use client";

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const AXIS = { fontFamily: '"Times New Roman", Times, serif', fontSize: 11, fill: "#8c8c8c" };

/** Monochrome series styles, distinguishable without colour. */
export const SERIES_STYLE: Record<string, { stroke: string; dash?: string; width: number; label: string }> = {
  truth: { stroke: "#0a0a0a", width: 2.2, label: "Ground truth" },
  gbt: { stroke: "#0a0a0a", dash: "6 3", width: 1.4, label: "Boosted trees" },
  mlp: { stroke: "#595959", dash: "2 3", width: 1.4, label: "Neural net" },
  logistic: { stroke: "#a6a6a6", width: 1.4, label: "Logistic" },
  ideal: { stroke: "#c8c8c8", dash: "1 4", width: 1, label: "Perfect calibration" },
  train: { stroke: "#a6a6a6", width: 1.2, label: "Train" },
  valid: { stroke: "#0a0a0a", width: 1.6, label: "Validation" },
};

function Legend({ keys }: { keys: string[] }) {
  return (
    <div className="mt-2 flex flex-wrap gap-4 text-[0.75rem] text-muted">
      {keys.map((k) => {
        const s = SERIES_STYLE[k];
        return (
          <span key={k} className="inline-flex items-center gap-2">
            <svg width="22" height="6" aria-hidden>
              <line x1="0" y1="3" x2="22" y2="3" stroke={s.stroke} strokeWidth={s.width} strokeDasharray={s.dash} />
            </svg>
            {s.label}
          </span>
        );
      })}
    </div>
  );
}

/** Several named series over a shared x grid. */
export function MultiLineChart({
  x,
  series,
  xLabel,
  yDomain = [0, 1],
  yFormat = (v: number) => `${Math.round(v * 100)}%`,
  height = 220,
}: {
  x: number[];
  series: Record<string, number[]>;
  xLabel: (v: number) => string;
  yDomain?: [number | "auto", number | "auto"];
  yFormat?: (v: number) => string;
  height?: number;
}) {
  const keys = Object.keys(series);
  const data = x.map((xv, i) => Object.fromEntries([["x", xv], ...keys.map((k) => [k, series[k][i]])]));
  return (
    <>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
          <CartesianGrid stroke="#ececec" vertical={false} />
          <XAxis dataKey="x" type="number" domain={["dataMin", "dataMax"]} tickFormatter={xLabel} tick={AXIS} stroke="#c8c8c8" />
          <YAxis domain={yDomain} tickFormatter={yFormat} tick={AXIS} stroke="#c8c8c8" width={44} />
          <Tooltip
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <div className="border border-ink bg-paper px-3 py-2 text-xs">
                  <div className="text-muted">{xLabel(Number(label))}</div>
                  {payload.map((p) => (
                    <div key={String(p.dataKey)} className="tnum">
                      {SERIES_STYLE[String(p.dataKey)]?.label ?? p.dataKey}: {yFormat(Number(p.value))}
                    </div>
                  ))}
                </div>
              ) : null
            }
          />
          {keys.map((k) => {
            const s = SERIES_STYLE[k] ?? { stroke: "#0a0a0a", width: 1.2 };
            return (
              <Line key={k} type="monotone" dataKey={k} stroke={s.stroke} strokeWidth={s.width} strokeDasharray={s.dash} dot={false} isAnimationActive={false} />
            );
          })}
        </LineChart>
      </ResponsiveContainer>
      <Legend keys={keys} />
    </>
  );
}

/** Reliability diagram: predicted vs observed landing rate per bin. */
export function ReliabilityChart({ bins }: { bins: Record<string, Array<{ predicted: number; observed: number }>> }) {
  const keys = Object.keys(bins);
  return (
    <>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
          <CartesianGrid stroke="#ececec" />
          <XAxis dataKey="predicted" type="number" domain={[0, 1]} tickFormatter={(v) => `${Math.round(v * 100)}%`} tick={AXIS} stroke="#c8c8c8" />
          <YAxis dataKey="observed" type="number" domain={[0, 1]} tickFormatter={(v) => `${Math.round(v * 100)}%`} tick={AXIS} stroke="#c8c8c8" width={44} />
          <Line data={[{ predicted: 0, observed: 0 }, { predicted: 1, observed: 1 }]} dataKey="observed" stroke={SERIES_STYLE.ideal.stroke} strokeDasharray={SERIES_STYLE.ideal.dash} dot={false} isAnimationActive={false} />
          {keys.map((k) => {
            const s = SERIES_STYLE[k];
            return (
              <Line key={k} data={bins[k]} dataKey="observed" stroke={s.stroke} strokeWidth={s.width} strokeDasharray={s.dash} dot={{ r: 2, fill: s.stroke }} isAnimationActive={false} />
            );
          })}
        </LineChart>
      </ResponsiveContainer>
      <Legend keys={[...keys, "ideal"]} />
    </>
  );
}
