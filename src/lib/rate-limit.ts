/**
 * Best-effort fixed-window rate limiter, per server instance and client IP.
 *
 * Serverless platforms run several instances, so this caps abuse per instance
 * rather than globally. That is enough to stop one client hammering the copilot
 * (which may call a paid model) without adding infrastructure. A shared store
 * such as Redis is the production replacement.
 */

const windows = new Map<string, { start: number; count: number }>();

export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfterS: number } {
  const now = Date.now();
  const w = windows.get(key);
  if (!w || now - w.start >= windowMs) {
    windows.set(key, { start: now, count: 1 });
    if (windows.size > 5000) {
      for (const [k, v] of windows) if (now - v.start >= windowMs) windows.delete(k);
    }
    return { ok: true, retryAfterS: 0 };
  }
  w.count++;
  return { ok: w.count <= limit, retryAfterS: Math.ceil((w.start + windowMs - now) / 1000) };
}

export function clientKey(req: Request, scope: string): string {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
  return `${scope}:${ip}`;
}
