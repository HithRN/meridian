import { describe, expect, it } from "vitest";
import {
  bookStats,
  depthCurve,
  executionCost,
  formatPrice,
  groupingOptions,
  mergeCandle,
  mergeDepth,
  niceTicks,
  parseLevels,
  withTotals,
  type Level,
} from "@/core/market/book";

const bids: Level[] = [
  { px: 99, sz: 10, n: 1 },
  { px: 98, sz: 20, n: 2 },
];
const asks: Level[] = [
  { px: 101, sz: 10, n: 1 },
  { px: 102, sz: 20, n: 1 },
];

describe("market book arithmetic", () => {
  it("parses string levels from the feed", () => {
    expect(parseLevels([{ px: "92.98", sz: "0.12", n: 3 }])).toEqual([{ px: 92.98, sz: 0.12, n: 3 }]);
  });

  it("computes spread, mid and imbalance", () => {
    const s = bookStats(bids, asks)!;
    expect(s.mid).toBe(100);
    expect(s.spread).toBe(2);
    expect(s.spreadBps).toBeCloseTo(200, 6);
    expect(s.bidShare).toBeCloseTo((990 + 1960) / (990 + 1960 + 1010 + 2040), 9);
    expect(bookStats([], asks)).toBeNull();
  });

  it("accumulates totals in base units and USD", () => {
    expect(withTotals(bids, "base").map((l) => l.total)).toEqual([10, 30]);
    expect(withTotals(bids, "usd").map((l) => l.total)).toEqual([990, 2950]);
  });

  it("charges nothing beyond the touch for an order inside the best level", () => {
    const c = executionCost(asks, 505, 100)!;
    expect(c.complete).toBe(true);
    expect(c.avgPx).toBeCloseTo(101, 9);
    expect(c.worstPx).toBe(101);
    expect(c.costBps).toBeCloseTo(100, 6);
  });

  it("walks levels and averages the fill price", () => {
    const c = executionCost(asks, 1010 + 1020, 100)!;
    expect(c.complete).toBe(true);
    expect(c.worstPx).toBe(102);
    expect(c.avgPx).toBeCloseTo(2030 / 20, 9);
  });

  it("reports when the book cannot fill the order", () => {
    const c = executionCost(asks, 1_000_000, 100)!;
    expect(c.complete).toBe(false);
    expect(c.filledUsd).toBeCloseTo(1010 + 2040, 9);
    expect(executionCost([], 100, 100)).toBeNull();
  });

  it("adds only unseen size when merging a deeper book", () => {
    const fine: Level[] = [{ px: 101, sz: 5, n: 1 }, { px: 101.5, sz: 5, n: 1 }];
    const coarse: Level[] = [{ px: 102, sz: 12, n: 3 }, { px: 110, sz: 8, n: 2 }];
    const merged = mergeDepth(fine, coarse, "ask");
    expect(merged.reduce((s, l) => s + l.sz, 0)).toBeCloseTo(20, 9);
    expect(merged.map((l) => l.px)).toEqual([101, 101.5, 102, 110]);
    expect(merged[2].sz).toBeCloseTo(2, 9);
  });

  it("never places merged size at a better price than the fine book's end", () => {
    const fine: Level[] = [{ px: 99, sz: 5, n: 1 }, { px: 98.5, sz: 1, n: 1 }];
    const merged = mergeDepth(fine, [{ px: 99, sz: 9, n: 1 }], "bid");
    expect(merged[2]).toMatchObject({ px: 98.5 });
    expect(merged[2].sz).toBeCloseTo(3, 9);
  });

  it("builds a monotonic depth curve within the distance limit", () => {
    const d = depthCurve(bids, asks, 100, 0.015);
    expect(d.map((p) => p.px)).toEqual([99, 101]);
    expect(depthCurve(bids, asks, 100, 0.05).map((p) => p.px)).toEqual([98, 99, 101, 102]);
  });
});

describe("candles and display", () => {
  const c = (t: number, close: number) => ({ t, o: 1, h: 2, l: 0.5, c: close, v: 1 });

  it("updates the open candle and appends new ones", () => {
    const one = mergeCandle([], c(1, 1));
    const updated = mergeCandle(one, c(1, 1.5));
    expect(updated).toHaveLength(1);
    expect(updated[0].c).toBe(1.5);
    expect(mergeCandle(updated, c(2, 1))).toHaveLength(2);
    expect(mergeCandle(updated, c(0, 9))).toBe(updated);
  });

  it("produces round axis ticks inside the range", () => {
    const t = niceTicks(75_600, 79_600, 8);
    expect(t).toContain(76_000);
    expect(t[0]).toBeGreaterThanOrEqual(75_600);
    expect(t[t.length - 1]).toBeLessThanOrEqual(79_600);
  });

  it("formats prices to five significant figures", () => {
    expect(formatPrice(76470)).toBe("76,470");
    expect(formatPrice(93.003)).toBe("93.003");
    expect(formatPrice(0.35315)).toBe("0.35315");
  });

  it("derives grouping ticks from the price", () => {
    expect(groupingOptions(76470).map((o) => o.tick)).toEqual([1, 10, 100, 1000]);
    expect(groupingOptions(93).map((o) => o.tick)).toEqual([0.001, 0.01, 0.1, 1]);
  });
});
