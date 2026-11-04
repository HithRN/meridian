import type { Metadata } from "next";
import { PageHeader, PageBody } from "@/components/layout/PageHeader";
import { Tabs } from "@/components/ui/Tabs";
import { ExperimentsList } from "@/components/experiment/ExperimentsList";
import { MarketReports } from "@/components/experiment/MarketReports";
import { ModelRegistry } from "@/components/experiment/ModelRegistry";

export const metadata: Metadata = {
  title: "Models & experiments",
  description: "Every research run and every model it produced, with acceptance criteria and lifecycle status.",
};

export default function ModelsAndExperimentsPage() {
  return (
    <>
      <PageHeader
        title="Models & experiments"
        lede="Every run is a repeatable record, and every model it produced is pinned to its dataset, features and seed. Status comes from explicit acceptance criteria, so every count on this page agrees."
      />
      <PageBody>
        <Tabs
          tabs={[
            { id: "experiments", label: "Experiments", content: <ExperimentsList /> },
            { id: "models", label: "Models", content: <ModelRegistry /> },
            { id: "market-reports", label: "Market reports", content: <MarketReports /> },
          ]}
        />
      </PageBody>
    </>
  );
}
