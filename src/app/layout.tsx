import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { Sidebar } from "@/components/layout/Sidebar";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: {
    default: "Meridian · Research with clarity. Decisions with confidence.",
    template: "%s · Meridian",
  },
  description:
    "An intelligent, transparent and reproducible quantitative research platform: agents plan and coordinate, deterministic tools compute, an independent critic challenges the results, and every conclusion links to traceable evidence.",
  applicationName: "Meridian",
  authors: [{ name: SITE.author, url: SITE.repoUrl }],
  openGraph: {
    title: "Meridian · Research with clarity. Decisions with confidence.",
    description:
      "AI proposes and coordinates. Deterministic tools calculate. Independent evaluation challenges the results. Every conclusion has traceable evidence.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">
        <div className="md:flex md:items-start">
          <Sidebar />
          <main className="flex min-h-screen min-w-0 flex-1 flex-col">
            <div className="flex-1">{children}</div>
            <footer className="mt-16 bg-brand px-6 py-10 text-white md:px-10">
              <div className="mx-auto flex max-w-6xl flex-wrap items-start justify-between gap-6 text-[0.82rem]">
                <div>
                  <div className="text-[0.95rem] font-semibold tracking-tight">{SITE.name}</div>
                  <div className="mt-1 text-white/70">Trust in the process. Confidence in the evidence.</div>
                  <div className="mt-3 text-white/60">Created by {SITE.author} · {SITE.status} · Not investment advice.</div>
                </div>
                <nav className="flex flex-wrap gap-x-6 gap-y-2 text-white/80" aria-label="Footer">
                  <Link href="/contact" className="hover:text-white">About &amp; contact</Link>
                  <Link href="/security" className="hover:text-white">Security</Link>
                  <Link href="/privacy" className="hover:text-white">Privacy</Link>
                  <Link href="/terms" className="hover:text-white">Terms</Link>
                  <Link href="/developers" className="hover:text-white">MCP &amp; API</Link>
                  <a href={SITE.repoUrl} className="hover:text-white">Source</a>
                </nav>
              </div>
            </footer>
          </main>
        </div>
      </body>
    </html>
  );
}
