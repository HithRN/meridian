import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader, PageBody, Section } from "@/components/layout/PageHeader";
import { Badge, Stat } from "@/components/ui/primitives";
import { getSeedResults } from "@/core/experiments/seed";
import { featureSetId } from "@/core/ml/pipeline";
import { num, pct, dateShort } from "@/lib/format";

export const metadata: Metadata = {
  title: "Models",
  description: "Model versions, evaluation status and lifecycle across experiments.",
};

const LIFECYCLE = ["candidate", "evaluated", "approved-for-demo", "archived"] as const;

export default async function ModelsPage() {
  const results = await getSeedResults();

  const rows = results.flatMap((r) =>
    r.record.models.map((m) => ({
      modelId: m.modelId,
      type: m.modelType,
      experimentId: r.record.id,
      dataset: `${r.record.dataset.datasetId}@${r.record.dataset.version}`,
      featureSet: featureSetId(r.record.dataset.datasetId, r.record.dataset.version, r.record.featureConfig),
      gitCommit: r.record.versions.gitCommit,
      auc: m.metrics.auc,
      sharpe: m.backtest?.sharpe ?? null,
      maxDd: m.backtest?.maxDrawdown ?? null,
      status: m.modelId === r.record.bestModelId ? r.record.status : "candidate",
      createdAt: r.record.createdAt,
      isBest: m.modelId === r.record.bestModelId,
    })),
  );

  const lifecycleCounts = LIFECYCLE.map((s) => ({
    status: s,
    count: rows.filter((row) => row.status === s).length,
  }));

  const approved = rows.filter((r) => r.status === "evaluated" || r.status === "approved-for-demo");

  return (
    <>
      <PageHeader
        index="03"
        title="Model registry"
        lede="Each trained model is a versioned artifact identified by a content hash and pinned to a dataset version, feature-set version, seed and build commit — the minimum needed to reproduce it."
      />
      <PageBody>
        <Section eyebrow="Lifecycle" title="Model status distribution">
          <div className="grid grid-cols-2 gap-px border border-line bg-line sm:grid-cols-4">
            {lifecycleCounts.map((l) => (
              <div key={l.status} className="bg-paper px-5 py-5">
                <Stat label={l.status.replace(/-/g, " ")} value={l.count} />
              </div>
            ))}
          </div>
          <p className="mt-3 text-sm text-muted">
            Lifecycle: candidate → evaluated → approved-for-demo → archived. The best model of each
            experiment advances past candidate once the critic raises no high-severity objection.
          </p>
        </Section>

        <Section eyebrow="Registry" title="All model versions">
          <div className="overflow-x-auto border border-line">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-ink">
                  {["Model id", "Type", "Dataset", "Feature set", "AUC", "Sharpe", "Max DD", "Status", "Built"].map((h) => (
                    <th key={h} className="px-3 py-3 text-left font-normal uppercase tracking-[0.1em] text-faint">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.modelId + r.experimentId} className="border-b border-line last:border-b-0 hover:bg-subtle">
                    <td className="px-3 py-3">
                      <Link href={`/experiments/${r.experimentId}`} className="tnum underline-offset-2 hover:underline">
                        {r.modelId}
                      </Link>
                    </td>
                    <td className="px-3 py-3">
                      <span className="flex items-center gap-2">
                        {r.type}
                        {r.isBest ? <Badge variant="solid">best</Badge> : null}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-muted">{r.dataset}</td>
                    <td className="tnum px-3 py-3 text-muted">{r.featureSet}</td>
                    <td className="tnum px-3 py-3 text-muted">{num(r.auc)}</td>
                    <td className="tnum px-3 py-3 text-muted">{r.sharpe === null ? "—" : num(r.sharpe, 2)}</td>
                    <td className="tnum px-3 py-3 text-muted">{r.maxDd === null ? "—" : pct(r.maxDd)}</td>
                    <td className="px-3 py-3"><Badge variant="muted">{r.status}</Badge></td>
                    <td className="tnum px-3 py-3 text-muted">{dateShort(r.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section eyebrow="Approved for demo" title="Evaluation status">
          {approved.length === 0 ? (
            <p className="text-muted">No models have passed evaluation yet.</p>
          ) : (
            <ul className="border border-line">
              {approved.map((r) => (
                <li key={r.modelId} className="flex items-center justify-between border-b border-line px-4 py-3 last:border-b-0">
                  <span className="flex items-center gap-3">
                    <code className="text-sm">{r.modelId}</code>
                    <span className="text-sm text-muted">{r.type} · {r.dataset}</span>
                  </span>
                  <span className="tnum text-sm text-muted">AUC {num(r.auc)} · commit {r.gitCommit.slice(0, 8)}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </PageBody>
    </>
  );
}
