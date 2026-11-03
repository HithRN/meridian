import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader, PageBody, Section } from "@/components/layout/PageHeader";
import { Badge, Stat } from "@/components/ui/primitives";
import { SyntheticNotice } from "@/components/experiment/SyntheticNotice";
import { getSeedResults } from "@/core/experiments/seed";
import { MODEL_STATUSES, STATUS_MEANING, acceptanceCriteria, modelStatus, type ModelStatus } from "@/core/experiments/lifecycle";
import { featureSetId } from "@/core/ml/pipeline";
import { num, pct, dateShort } from "@/lib/format";
import { modelLabelShort, datasetLabel } from "@/lib/labels";
import { cn } from "@/lib/cn";

export const metadata: Metadata = {
  title: "Models",
  description: "Model versions, acceptance criteria and lifecycle status across experiments.",
};

const STATUS_BADGE: Record<ModelStatus, "running" | "info" | "success" | "danger" | "neutral"> = {
  candidate: "running",
  evaluated: "info",
  approved: "success",
  rejected: "danger",
  archived: "neutral",
};

export default async function ModelsPage() {
  const results = await getSeedResults();

  const rows = results.flatMap((r) =>
    r.record.models.map((m) => ({
      record: r.record,
      model: m,
      status: modelStatus(r.record, m),
      featureSet: featureSetId(r.record.dataset.datasetId, r.record.dataset.version, r.record.featureConfig),
      isBest: m.modelId === r.record.bestModelId,
      isBaseline: m.modelId === r.record.baselineModelId,
    })),
  );
  const counts = MODEL_STATUSES.map((s) => ({ status: s, count: rows.filter((row) => row.status === s).length }));
  const selected = rows.filter((r) => r.isBest);

  return (
    <>
      <PageHeader
        eyebrow="Workspace" accent="var(--color-mod-models)"
        title="Model registry"
        lede="Every trained model is pinned to a dataset version, feature-set hash, seed and build commit. Status is derived from explicit acceptance criteria in one place, so every count and list agrees."
      />
      <PageBody>
        <SyntheticNotice />

        <Section eyebrow="Lifecycle" title="Status distribution">
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-5">
            {counts.map((c) => (
              <div key={c.status} className="bg-paper px-5 py-4" title={STATUS_MEANING[c.status]}>
                <Stat label={c.status} value={c.count} />
                <p className="mt-2 text-[0.72rem] leading-snug text-faint">{STATUS_MEANING[c.status]}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section eyebrow="Selected models" title="Acceptance review">
          <p className="mb-4 max-w-3xl text-sm text-muted">
            The best model of each experiment is approved only if it passes all four criteria. Predictive quality (AUC) and portfolio
            performance (Sharpe) are judged separately: a small AUC edge can produce a large but statistically fragile Sharpe.
          </p>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {selected.map((r) => (
              <div key={r.model.modelId + r.record.id} className="rounded-lg border border-line bg-paper p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold">{modelLabelShort(r.model.modelType)}</div>
                    <div className="text-sm text-muted">{datasetLabel(r.record.dataset.datasetId)}</div>
                  </div>
                  <Badge variant={STATUS_BADGE[r.status]}>{r.status}</Badge>
                </div>
                <ul className="mt-4 space-y-2 text-sm">
                  {acceptanceCriteria(r.record, r.model).map((c) => (
                    <li key={c.id} className="flex items-start gap-2">
                      <span aria-hidden className={cn("mt-[1px] font-semibold", c.passed ? "text-positive" : "text-negative")}>
                        {c.passed ? "✓" : "✕"}
                      </span>
                      <span>
                        {c.label}
                        <span className="block text-[0.75rem] text-faint">{c.detail}</span>
                      </span>
                    </li>
                  ))}
                </ul>
                <Link href={`/experiments/${r.record.id}`} className="mt-4 inline-block text-sm text-accent-strong underline-offset-2 hover:underline">
                  Experiment detail →
                </Link>
              </div>
            ))}
          </div>
        </Section>

        <Section eyebrow="Registry" title="All model versions">
          <div className="overflow-x-auto rounded-lg border border-line bg-paper">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-line-strong">
                  {["Model", "Dataset", "Feature set", "OOS n", "AUC", "Net Sharpe ± SE", "Trades", "Max DD", "Status", "Built"].map((h) => (
                    <th key={h} className="whitespace-nowrap px-3 py-3 text-left text-[0.68rem] font-medium uppercase tracking-[0.08em] text-faint">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const bt = r.model.backtest;
                  return (
                    <tr key={r.model.modelId + r.record.id} className="border-b border-line last:border-b-0 hover:bg-subtle">
                      <td className="px-3 py-3">
                        <span className="flex items-center gap-2">
                          <Link href={`/experiments/${r.record.id}`} className="hover:underline">{modelLabelShort(r.model.modelType)}</Link>
                          {r.isBest ? <Badge variant="solid">selected</Badge> : null}
                          {r.isBaseline ? <Badge variant="muted">baseline</Badge> : null}
                        </span>
                        <code className="text-[0.72rem] text-faint">{r.model.modelId}</code>
                      </td>
                      <td className="px-3 py-3 text-muted">{datasetLabel(r.record.dataset.datasetId)}</td>
                      <td className="px-3 py-3 text-muted"><code className="text-[0.75rem]">{r.featureSet}</code></td>
                      <td className="tnum px-3 py-3 text-muted">{r.model.metrics.n.toLocaleString("en-US")}</td>
                      <td className="tnum px-3 py-3 text-muted">{num(r.model.metrics.auc)}</td>
                      <td className="tnum whitespace-nowrap px-3 py-3 text-muted">
                        {bt ? `${num(bt.sharpe, 2)}${bt.sharpeStdErr !== undefined ? ` ± ${num(bt.sharpeStdErr, 2)}` : ""}` : "—"}
                      </td>
                      <td className="tnum px-3 py-3 text-muted">{bt?.trades?.toLocaleString("en-US") ?? "—"}</td>
                      <td className="tnum px-3 py-3 text-muted">{bt ? pct(bt.maxDrawdown) : "—"}</td>
                      <td className="px-3 py-3"><Badge variant={STATUS_BADGE[r.status]}>{r.status}</Badge></td>
                      <td className="tnum px-3 py-3 text-muted">{dateShort(r.record.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 max-w-3xl text-[0.8rem] text-faint">
            OOS n = out-of-sample hourly predictions pooled across walk-forward folds. Sharpe is net of costs, executed one bar after the
            signal and annualised with √(periods per year) — 8,766 for a 24/7 hourly series. ± is the Lo (2002) standard error.
          </p>
        </Section>
      </PageBody>
    </>
  );
}
