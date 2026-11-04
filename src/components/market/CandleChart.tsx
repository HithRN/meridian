"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { formatCompact, formatPrice, INTERVAL_MS, INTERVALS, niceTicks, priceDecimals, type Candle, type Interval } from "@/core/market/book";
import { useCandles } from "@/hooks/useMarket";

const M = { top: 10, right: 72, bottom: 26, left: 8 };
const VOLUME_H = 70;
const GAP = 10;
const LABEL = { font: '12px "Times New Roman", Times, serif', fill: "var(--color-muted)" } as const;
const UP = "var(--color-chart-positive)";
const DOWN = "var(--color-chart-negative)";

const INTERVAL_LABEL: Record<Interval, string> = { "1m": "1m", "5m": "5m", "15m": "15m", "1h": "1h", "4h": "4h", "1d": "1D" };

function useWidth() {
  const ref = React.useRef<HTMLDivElement>(null);
  const [width, setWidth] = React.useState(0);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

function useNow() {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

const pad = (n: number) => String(n).padStart(2, "0");

function countdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

function timeLabel(t: number, interval: Interval, prev: number | null): string {
  const d = new Date(t);
  const day = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  if (interval === "1d") return day;
  const newDay = prev === null || new Date(prev).getDate() !== d.getDate();
  return newDay ? day : `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function CandleChart({ coin }: { coin: string }) {
  const [interval, setInterval_] = React.useState<Interval>("1h");
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex overflow-hidden rounded-md border border-line" role="group" aria-label="Candle interval">
          {INTERVALS.map((i) => (
            <button
              key={i}
              onClick={() => setInterval_(i)}
              aria-pressed={i === interval}
              className={cn("px-3 py-[5px] text-[0.9rem] transition-colors", i === interval ? "bg-accent text-on-accent" : "text-muted hover:bg-subtle hover:text-heading")}
            >
              {INTERVAL_LABEL[i]}
            </button>
          ))}
        </div>
      </div>
      <ChartBody key={`${coin}:${interval}`} coin={coin} interval={interval} />
    </div>
  );
}

function ChartBody({ coin, interval }: { coin: string; interval: Interval }) {
  const { candles, failed } = useCandles(coin, interval);
  const [ref, width] = useWidth();
  const now = useNow();
  const [pxPerCandle, setPxPerCandle] = React.useState(8);
  const [offset, setOffset] = React.useState(0);
  const [hover, setHover] = React.useState<{ x: number; y: number } | null>(null);
  const drag = React.useRef<{ x: number; offset: number } | null>(null);

  // Desktop matches the order book beside it; phones keep the page scrollable.
  const HEIGHT = width > 560 ? 600 : 440;
  const plotW = Math.max(0, width - M.left - M.right);
  const count = Math.max(10, Math.floor(plotW / pxPerCandle));
  const maxOffset = Math.max(0, candles.length - 10);
  const safeOffset = Math.min(offset, maxOffset);
  const end = candles.length - safeOffset;
  const visible = candles.slice(Math.max(0, end - count), end);
  const step = plotW / count;
  const bodyW = Math.max(1, Math.min(step * 0.68, 14));

  const priceH = HEIGHT - M.top - M.bottom - VOLUME_H - GAP;
  const lo = visible.length ? Math.min(...visible.map((c) => c.l)) : 0;
  const hi = visible.length ? Math.max(...visible.map((c) => c.h)) : 1;
  const padding = (hi - lo || hi * 0.01 || 1) * 0.06;
  const yMin = lo - padding;
  const yMax = hi + padding;
  const y = (p: number) => M.top + ((yMax - p) / (yMax - yMin)) * priceH;
  const priceAt = (py: number) => yMax - ((py - M.top) / priceH) * (yMax - yMin);
  const volMax = visible.length ? Math.max(...visible.map((c) => c.v), 1e-9) : 1;
  const volTop = M.top + priceH + GAP;
  // Aligned to the right edge, so a short history sits next to the price axis.
  const x = (i: number) => M.left + plotW - (visible.length - i - 0.5) * step;

  const hoverIndex = hover && step > 0 ? Math.round((hover.x - x(0)) / step) : null;
  const active: Candle | undefined = hoverIndex !== null && visible[hoverIndex] ? visible[hoverIndex] : visible[visible.length - 1];
  const last = candles[candles.length - 1];
  const reference = last?.c ?? 1;

  const ticks = niceTicks(yMin, yMax, 8).filter((t) => y(t) > M.top + 6 && y(t) < M.top + priceH - 6);
  const timeEvery = Math.max(1, Math.ceil(90 / Math.max(step, 0.01)));

  const pointer = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  if (failed && !candles.length) {
    return <div ref={ref} className="flex h-[440px] items-center justify-center text-muted">Candle history is unavailable right now.</div>;
  }

  const chg = active ? active.c / active.o - 1 : 0;

  return (
    <div>
      <div className="mb-2 flex min-h-[1.5rem] flex-wrap items-center gap-x-4 gap-y-1 text-[0.92rem]">
        {active ? (
          <>
            {(["o", "h", "l", "c"] as const).map((k) => (
              <span key={k} className="tnum">
                <span className="text-faint">{k.toUpperCase()} </span>
                <span className="text-heading">{formatPrice(active[k], reference)}</span>
              </span>
            ))}
            <span className={cn("tnum", chg >= 0 ? "text-positive" : "text-negative")}>
              {chg >= 0 ? "+" : ""}
              {(chg * 100).toFixed(2)}%
            </span>
            <span className="tnum"><span className="text-faint">Vol </span>{formatCompact(active.v)} {coin}</span>
            <span className="tnum text-faint">{new Date(active.t).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })}</span>
          </>
        ) : (
          <span className="text-muted">Loading candles…</span>
        )}
        <span className="ml-auto flex items-center gap-1">
          <ChartButton label="Zoom out" onClick={() => setPxPerCandle((p) => Math.max(3, p / 1.4))}>−</ChartButton>
          <ChartButton label="Zoom in" onClick={() => setPxPerCandle((p) => Math.min(28, p * 1.4))}>+</ChartButton>
          {safeOffset > 0 ? (
            <button onClick={() => setOffset(0)} className="ml-1 rounded-md border border-line px-2 py-[2px] text-[0.82rem] text-link hover:bg-subtle">Latest →</button>
          ) : null}
        </span>
      </div>

      <div ref={ref} className="w-full">
        {width > 0 ? (
          <svg
            width={width}
            height={HEIGHT}
            role="img"
            aria-label={active ? `${coin} candlestick chart, ${INTERVAL_LABEL[interval]} candles. Latest close ${formatPrice(last.c, reference)}.` : `${coin} candlestick chart`}
            className="block cursor-crosshair select-none"
            style={{ touchAction: "pan-y" }}
            onPointerDown={(e) => {
              drag.current = { x: e.clientX, offset: safeOffset };
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerUp={() => (drag.current = null)}
            onPointerLeave={() => setHover(null)}
            onPointerMove={(e) => {
              if (drag.current) {
                const moved = Math.round((e.clientX - drag.current.x) / step);
                setOffset(Math.max(0, Math.min(maxOffset, drag.current.offset + moved)));
              }
              setHover(pointer(e));
            }}
          >
            {/* Recessive grid and price axis */}
            {ticks.map((t) => (
              <g key={t}>
                <line x1={M.left} x2={M.left + plotW} y1={y(t)} y2={y(t)} stroke="var(--color-chart-grid)" />
                <text x={M.left + plotW + 8} y={y(t) + 4} style={LABEL}>{t.toLocaleString("en-US", { minimumFractionDigits: Math.max(0, priceDecimals(reference) - 1), maximumFractionDigits: priceDecimals(reference) })}</text>
              </g>
            ))}

            {/* Candles: hollow when price rose, solid when it fell */}
            {visible.map((c, i) => {
              const up = c.c >= c.o;
              const color = up ? UP : DOWN;
              const top = y(Math.max(c.o, c.c));
              const h = Math.max(1, Math.abs(y(c.o) - y(c.c)));
              return (
                <g key={c.t}>
                  <line x1={x(i)} x2={x(i)} y1={y(c.h)} y2={y(c.l)} stroke={color} />
                  <rect x={x(i) - bodyW / 2} y={top} width={bodyW} height={h} rx={1} fill={up ? "var(--color-paper)" : color} stroke={color} />
                  <rect
                    x={x(i) - bodyW / 2}
                    y={volTop + VOLUME_H - Math.max(1, (c.v / volMax) * VOLUME_H)}
                    width={bodyW}
                    height={Math.max(1, (c.v / volMax) * VOLUME_H)}
                    rx={1}
                    fill={color}
                    fillOpacity={0.4}
                  />
                </g>
              );
            })}

            {/* Volume pane */}
            <line x1={M.left} x2={M.left + plotW} y1={volTop + VOLUME_H} y2={volTop + VOLUME_H} stroke="var(--color-line)" />
            <text x={M.left + plotW + 8} y={volTop + 12} style={LABEL}>{formatCompact(volMax)}</text>
            <text x={M.left + plotW + 8} y={volTop + 28} style={{ ...LABEL, fill: "var(--color-faint)" }}>volume</text>

            {/* Time axis */}
            {visible.map((c, i) =>
              i % timeEvery === 0 ? (
                <text key={c.t} x={x(i)} y={HEIGHT - 8} textAnchor="middle" style={LABEL}>
                  {timeLabel(c.t, interval, i >= timeEvery ? visible[i - timeEvery].t : null)}
                </text>
              ) : null,
            )}

            {/* Live price line with countdown to the candle's close */}
            {last && y(last.c) >= M.top && y(last.c) <= M.top + priceH ? (
              <g>
                <line x1={M.left} x2={M.left + plotW} y1={y(last.c)} y2={y(last.c)} stroke="var(--color-heading)" strokeDasharray="2 3" strokeOpacity={0.6} />
                <rect x={M.left + plotW + 2} y={y(last.c) - 18} width={M.right - 4} height={36} rx={3} fill={last.c >= last.o ? "var(--color-positive)" : "var(--color-negative)"} />
                <text x={M.left + plotW + 2 + (M.right - 4) / 2} y={y(last.c) - 3} textAnchor="middle" style={{ font: '600 12px "Times New Roman", Times, serif', fill: "#fff" }}>{formatPrice(last.c, reference)}</text>
                <text x={M.left + plotW + 2 + (M.right - 4) / 2} y={y(last.c) + 12} textAnchor="middle" style={{ font: '11px "Times New Roman", Times, serif', fill: "#fff" }}>{countdown(last.t + INTERVAL_MS[interval] - now)}</text>
              </g>
            ) : null}

            {/* Crosshair */}
            {hover && hover.x >= M.left && hover.x <= M.left + plotW && hover.y >= M.top && hover.y <= M.top + priceH ? (
              <g pointerEvents="none">
                <line x1={hoverIndex !== null && visible[hoverIndex] ? x(hoverIndex) : hover.x} x2={hoverIndex !== null && visible[hoverIndex] ? x(hoverIndex) : hover.x} y1={M.top} y2={volTop + VOLUME_H} stroke="var(--color-chart-benchmark)" strokeDasharray="3 3" />
                <line x1={M.left} x2={M.left + plotW} y1={hover.y} y2={hover.y} stroke="var(--color-chart-benchmark)" strokeDasharray="3 3" />
                <rect x={M.left + plotW + 2} y={hover.y - 10} width={M.right - 4} height={20} rx={3} fill="var(--color-heading)" />
                <text x={M.left + plotW + 2 + (M.right - 4) / 2} y={hover.y + 4} textAnchor="middle" style={{ font: '12px "Times New Roman", Times, serif', fill: "#fff" }}>{formatPrice(priceAt(hover.y), reference)}</text>
              </g>
            ) : null}
          </svg>
        ) : (
          <div style={{ height: HEIGHT }} />
        )}
      </div>
      <p className="mt-2 text-[0.85rem] text-faint">Hollow candles closed higher, solid candles closed lower. Drag to look back. Times are in your local timezone.</p>
    </div>
  );
}

function ChartButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button aria-label={label} title={label} onClick={onClick} className="h-7 w-7 rounded-md border border-line text-heading hover:bg-subtle">
      {children}
    </button>
  );
}
