import Link from "next/link";
import { Section } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/primitives";
import { ModelExplorer } from "@/components/experiment/ModelExplorer";
import { getSeedResults } from "@/core/experiments/seed";
import { MODEL_STATUSES, STATUS_MEANING, acceptanceCriteria, modelStatus, type ModelStatus } from "@/core/experiments/lifecycle";
import { featureSetId } from "@/core/ml/pipeline";
import { dateShort } from "@/lib/format";
import { modelLabelShort, datasetLabel } from "@/lib/labels";
import { cn } from "@/lib/cn";
import { RangeChart } from "@/components/charts/PlainCharts";

const STATUS_BADGE: Record<ModelStatus, "running" | "info" | "success" | "danger" | "neutral"> = {
  candidate: "running",
  evaluated: "info",
  approved: "success",
  rejected: "danger",
  archived: "neutral",
};

export async function ModelRegistry() {
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
  const selected = rows.filter((r) => r.isBest);

  return (
    <>
        
        <Section title="Every model version">
          <ModelExplorer
            statuses={MODEL_STATUSES.map((status) => ({ status, meaning: STATUS_MEANING[status], variant: STATUS_BADGE[status] }))}
            rows={rows.map((r) => ({
              key: r.model.modelId + r.record.id,
              experimentId: r.record.id,
              model: modelLabelShort(r.model.modelType),
              modelId: r.model.modelId,
              dataset: datasetLabel(r.record.dataset.datasetId),
              featureSet: r.featureSet,
              n: r.model.metrics.n,
              auc: r.model.metrics.auc,
              sharpe: r.model.backtest?.sharpe ?? null,
              sharpeSe: r.model.backtest?.sharpeStdErr ?? null,
              trades: r.model.backtest?.trades ?? null,
              maxDrawdown: r.model.backtest?.maxDrawdown ?? null,
              status: r.status,
              built: dateShort(r.record.createdAt),
              isBest: r.isBest,
              isBaseline: r.isBaseline,
            }))}
          />
          <p className="mt-3 max-w-3xl text-[0.8rem] text-faint">
            OOS n = out-of-sample hourly predictions pooled across walk-forward folds. Sharpe is net of costs, executed one bar after the
            signal and annualised with √(periods per year), which is 8,766 for a 24/7 hourly series. ± is the Lo (2002) standard error.
          </p>
        </Section>

        <Section eyebrow="Selected models" title="Acceptance review">
          <p className="mb-4 max-w-3xl text-sm text-muted">
            The best model of each experiment is approved only if it passes all four criteria. Predictive quality (AUC) and portfolio
            performance (Sharpe) are judged separately: a small AUC edge can produce a large but statistically fragile Sharpe.
          </p>
          <div className="mb-6 rounded-lg border border-line bg-paper p-5">
            <h3 className="text-[1.05rem] font-semibold">Risk-adjusted return, with its plausible range</h3>
            <p className="mb-4 mt-1 text-[0.9rem] text-muted">Net Sharpe ratio of each selected model, after trading costs, with a 95% interval.</p>
            <RangeChart
              rows={selected
                .filter((r) => r.model.backtest)
                .map((r) => {
                  const bt = r.model.backtest!;
                  const se = bt.sharpeStdErr ?? 0;
                  return {
                    label: `${modelLabelShort(r.model.modelType)} · ${datasetLabel(r.record.dataset.datasetId)}`,
                    value: bt.sharpe,
                    low: bt.sharpe - 1.96 * se,
                    high: bt.sharpe + 1.96 * se,
                  };
                })}
            />
          </div>
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
                <Link href={`/experiments/${r.record.id}`} className="mt-4 inline-block text-sm text-link underline-offset-2 hover:underline">
                  Experiment detail →
                </Link>
              </div>
            ))}
          </div>
        </Section>

</>
  );
}
