/** Server-side market snapshot for the homepage. Returns null if the feed is unreachable. */

export interface MarketSummary {
  coin: string;
  price: number;
  change: number;
  volumeUsd: number;
}

interface Meta {
  universe: Array<{ name: string }>;
}
interface Ctx {
  markPx: string;
  prevDayPx: string;
  dayNtlVlm: string;
}

export async function fetchMarketSummary(coins: string[]): Promise<MarketSummary[] | null> {
  try {
    const res = await fetch("https://api.hyperliquid.xyz/info", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "metaAndAssetCtxs" }),
      signal: AbortSignal.timeout(4_000),
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    const [meta, ctxs] = (await res.json()) as [Meta, Ctx[]];
    const rows = coins.flatMap((coin) => {
      const i = meta.universe.findIndex((u) => u.name === coin);
      if (i < 0) return [];
      const price = Number(ctxs[i].markPx);
      const prev = Number(ctxs[i].prevDayPx);
      return [{ coin, price, change: prev > 0 ? price / prev - 1 : 0, volumeUsd: Number(ctxs[i].dayNtlVlm) }];
    });
    return rows.length ? rows : null;
  } catch {
    return null;
  }
}
