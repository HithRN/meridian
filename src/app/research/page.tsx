import type { Metadata } from "next";
import { PageHeader, PageBody } from "@/components/layout/PageHeader";
import { ResearchModes } from "@/components/research/ResearchModes";

export const metadata: Metadata = {
  title: "Research",
  description: "Ask a question about the market as it is today and get an answer with statistical tests and charts, or test a hypothesis on bundled datasets.",
};

export default function ResearchPage() {
  return (
    <>
      <PageHeader
        title="Research"
        lede="Ask a question in plain words. Meridian pulls live market data, runs the right statistical tests, and answers with the evidence, the charts and the reasons to be careful."
      />
      <PageBody>
        <ResearchModes />
      </PageBody>
    </>
  );
}
