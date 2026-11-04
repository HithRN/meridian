import type { Metadata } from "next";
import { PageHeader, PageBody } from "@/components/layout/PageHeader";
import { Prose } from "@/components/layout/Prose";

export const metadata: Metadata = { title: "Terms", description: "Terms of use for the Meridian research preview." };

export default function TermsPage() {
  return (
    <>
      <PageHeader eyebrow="Resources" accent="var(--color-mod-resources)" title="Terms of use" lede="Plain-language terms for the research preview. Not reviewed by legal counsel." />
      <PageBody>
        <Prose>
          <h2>Demonstration only</h2>
          <p>
            Meridian is a research preview provided as is, without warranty. Hypothesis lab results are computed on synthetic data and market research on live public data, and network
            figures come from third-party public APIs that may be delayed or wrong.
          </p>
          <h2>Not investment advice</h2>
          <p>
            Nothing on this site is investment, trading, tax or legal advice, or an offer to buy or sell any asset. Backtests are
            hypothetical and do not represent real trading.
          </p>
          <h2>Acceptable use</h2>
          <ul>
            <li>Do not attempt to overload, probe or bypass the service&rsquo;s limits.</li>
            <li>Do not submit confidential or personal data to the copilot.</li>
            <li>Do not present Meridian output as audited research without independent verification.</li>
          </ul>
          <h2>Changes</h2>
          <p>Features and these terms may change while the project is in preview.</p>
        </Prose>
      </PageBody>
    </>
  );
}
