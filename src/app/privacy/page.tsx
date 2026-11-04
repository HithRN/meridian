import type { Metadata } from "next";
import { PageHeader, PageBody } from "@/components/layout/PageHeader";
import { Prose } from "@/components/layout/Prose";
import { SITE } from "@/lib/site";

export const metadata: Metadata = { title: "Privacy", description: "What data Meridian handles and where it goes." };

export default function PrivacyPage() {
  return (
    <>
      <PageHeader eyebrow="Resources" accent="var(--color-mod-resources)" title="Privacy" lede="A plain-language description of what the demo does with data. Not reviewed by legal counsel." />
      <PageBody>
        <Prose>
          <h2>No accounts</h2>
          <p>Meridian has no sign-up and stores no personal profile.</p>
          <h2>Research runs</h2>
          <p>
            Runs you start are computed in your browser or on the server, and your experiment history is kept in your browser&rsquo;s local
            storage. Clearing site data deletes it. It is not uploaded.
          </p>
          <h2>Copilot messages</h2>
          <p>
            Questions sent to the copilot are processed on the server. When the operator has enabled Claude, the conversation is sent to
            Anthropic&rsquo;s API to generate the answer. With Claude disabled, answers come from a local rule-based engine and nothing leaves
            the server.
          </p>
          <h2>Browser-local model</h2>
          <p>If you choose the WebLLM reasoner, the model is downloaded to your device and runs entirely there.</p>
          <h2>Live market data</h2>
          <p>
            The Markets and Market intelligence pages connect your browser directly to Hyperliquid&rsquo;s and Jito&rsquo;s public APIs, so
            those services can see your IP address. Nothing else is sent.
          </p>
          <h2>Hosting and preferences</h2>
          <p>
            The hosting provider may keep standard request logs. Meridian uses no analytics or advertising trackers.
          </p>
          <h2>Contact</h2>
          <p>
            Questions: <a href={SITE.issuesUrl}>{SITE.issuesUrl.replace("https://", "")}</a>.
          </p>
        </Prose>
      </PageBody>
    </>
  );
}
