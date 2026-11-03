import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Market intelligence",
  description: "Live Jito tip auction, MEV value flow, validator economics and stake concentration, with JitoSOL scenarios.",
};

export default function IntelLayout({ children }: { children: React.ReactNode }) {
  return children;
}
