/** Formatting helpers shared across the UI. Pure, locale-stable. */

export function pct(x: number, digits = 2): string {
  return `${(x * 100).toFixed(digits)}%`;
}

export function num(x: number, digits = 3): string {
  return x.toFixed(digits);
}

export function signed(x: number, digits = 2): string {
  const s = x.toFixed(digits);
  return x > 0 ? `+${s}` : s;
}

export function compact(x: number): string {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(x);
}

export function dateTime(ms: number): string {
  return new Date(ms).toISOString().replace("T", " ").slice(0, 16) + "Z";
}

export function dateShort(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function duration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

export function titleCase(s: string): string {
  return s.replace(/(^|[\s-])(\w)/g, (_, p, c) => p + c.toUpperCase());
}
