import type { Metadata } from "next";
import { PageHeader, PageBody } from "@/components/layout/PageHeader";
import { Prose } from "@/components/layout/Prose";
import { KeyValue } from "@/components/ui/primitives";
import { SITE } from "@/lib/site";

export const metadata: Metadata = { title: "About & contact", description: "Who builds Meridian, its purpose and development status." };

export default function ContactPage() {
  return (
    <>
      <PageHeader eyebrow="Resources" accent="var(--color-mod-resources)" title="About & contact" lede="Who builds Meridian, why, and how far along it is." />
      <PageBody>
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Prose>
              <h2>Purpose</h2>
              <p>
                Meridian explores reproducible quantitative research infrastructure. AI proposes and coordinates, deterministic tools
                calculate, independent evaluation challenges the results, and every conclusion links to evidence. Solana and Jito research is
                a specialised vertical built on the same audit framework.
              </p>
              <h2>Development status</h2>
              <ul>
                <li>
                  <strong>Working:</strong> end-to-end research runs, walk-forward evaluation, next-bar backtesting with explicit costs, the
                  critic, evidence reports, the Jito Lab, explainable bundle-landing models, the copilot and the MCP server.
                </li>
                <li>
                  <strong>Not yet built:</strong> accounts and team workspaces, durable experiment storage, real dataset upload and licensed
                  market data.
                </li>
              </ul>
            </Prose>
          </div>
          <div className="h-fit rounded-lg border border-line bg-paper p-5">
            <KeyValue k="Created by" v={SITE.author} />
            <KeyValue k="Status" v="Research preview" />
          </div>
        </div>
      </PageBody>
    </>
  );
}
