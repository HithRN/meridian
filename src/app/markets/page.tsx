import type { Metadata } from "next";
import { PageHeader, PageBody } from "@/components/layout/PageHeader";
import { MarketTerminal } from "@/components/market/MarketTerminal";

export const metadata: Metadata = {
  title: "Markets",
  description: "Live candlestick charts, order books and trades for SOL, JTO, BTC and more, with the cost of large orders measured from the live book.",
};

export default function MarketsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Workspace"
        accent="var(--color-mod-research)"
        title="Markets"
        lede="Live price, order book and trades, and what those numbers mean for anyone moving serious size."
      />
      <PageBody>
        <MarketTerminal />
        <p className="mt-6 text-[0.85rem] text-faint">
          Perpetual futures data, streamed directly to your browser from Hyperliquid&rsquo;s public API. Not affiliated with Hyperliquid.
        </p>
      </PageBody>
    </>
  );
}
