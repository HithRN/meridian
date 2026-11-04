/** Market research reports kept in this browser, newest first. */

import type { MarketReport } from "@/core/market/research/types";

const KEY = "meridian.market-reports";
const MAX = 8;

export function loadReports(): MarketReport[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as MarketReport[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function saveReport(report: MarketReport): void {
  let list = [report, ...loadReports().filter((r) => r.id !== report.id)].slice(0, MAX);
  // Reports can be large; drop the oldest until the browser accepts them.
  while (list.length) {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(list));
      return;
    } catch {
      list = list.slice(0, -1);
    }
  }
}

export function clearReports(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Storage is unavailable; there is nothing to clear.
  }
}
