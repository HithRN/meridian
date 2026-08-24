import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/layout/Sidebar";

export const metadata: Metadata = {
  title: {
    default: "Meridian — Multi-Agent Quant Research & ML Operations",
    template: "%s · Meridian",
  },
  description:
    "A multi-agent quantitative research and MLOps platform. Specialised agents call deterministic, MCP-compatible tools to run leakage-safe experiments, backtest with costs, critique methodology, and produce auditable reports — deployed at zero cost with browser-local inference and a deterministic fallback.",
  applicationName: "Meridian",
  authors: [{ name: "Meridian" }],
  openGraph: {
    title: "Meridian — Multi-Agent Quant Research & ML Operations",
    description:
      "Auditable, deterministic, multi-agent quant research with MCP-compatible tools. Zero-cost, browser-local inference with a deterministic fallback.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">
        <div className="md:flex md:items-start">
          <Sidebar />
          <main className="min-w-0 flex-1">{children}</main>
        </div>
      </body>
    </html>
  );
}
