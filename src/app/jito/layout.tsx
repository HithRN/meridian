import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Jito Lab",
  description: "Live Jito tip floor, a conformal bundle-tip advisor validated walk-forward, and JitoSOL yield analytics.",
};

export default function JitoLayout({ children }: { children: React.ReactNode }) {
  return children;
}
