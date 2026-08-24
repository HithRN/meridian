/**
 * Deterministic reasoner.
 *
 * A transparent, rule-based interpreter that maps a research question to a
 * `ResearchPlan` by extracting parameters with a small grammar of patterns.
 * It is the required fallback (§17) and the default on browsers without
 * WebGPU — and because it is fully deterministic, it is also what the
 * acceptance tests run against. Every plan it emits is validated by the same
 * Zod schemas the WebLLM reasoner must satisfy.
 */

import type { Reasoner, NarrationContext } from "@/core/llm/types";
import type { ResearchPlan } from "@/core/orchestrator/types";
import type { DatasetMeta } from "@/core/data/dataset";
import type { ModelType } from "@/core/ml/models";
import {
  FeatureConfigSchema,
  WindowConfigSchema,
  StrategyConfigSchema,
  CostConfigSchema,
} from "@/core/schemas/configs";

function pickDataset(question: string, datasets: DatasetMeta[]): DatasetMeta {
  const q = question.toLowerCase();
  if (/\bfx\b|forex|currency/.test(q)) {
    const fx = datasets.find((d) => d.id.includes("fx"));
    if (fx) return fx;
  }
  // Default to the primary equity dataset (first non-fixture).
  return datasets.find((d) => d.id.includes("equity")) ?? datasets[0];
}

function parseModels(question: string): ModelType[] {
  const q = question.toLowerCase();
  const all: ModelType[] = ["majority", "logistic", "gbt"];
  // Explicit model mentions.
  const requested = new Set<ModelType>();
  if (/logistic|linear/.test(q)) requested.add("logistic");
  if (/gradient|boost|tree|xgb|gbt|non-?linear/.test(q)) requested.add("gbt");
  if (/baseline|majority|naive/.test(q)) requested.add("majority");

  if (requested.size > 0) {
    // A baseline is always included for honest comparison.
    requested.add("majority");
    return all.filter((m) => requested.has(m));
  }

  // "compare three models" / "compare N models"
  const numWords: Record<string, number> = { one: 1, two: 2, three: 3 };
  const m = q.match(/compare\s+(\w+)\s+models?/);
  if (m) {
    const n = Number(m[1]) || numWords[m[1]] || 3;
    return all.slice(0, Math.min(Math.max(n, 1), all.length));
  }
  return all;
}

function parseInt2(re: RegExp, question: string, fallback: number): number {
  const m = question.match(re);
  return m ? Number(m[1]) : fallback;
}

export class DeterministicReasoner implements Reasoner {
  id = "deterministic" as const;
  label = "Deterministic policy";

  isReady(): boolean {
    return true;
  }

  async interpret(question: string, datasets: DatasetMeta[]): Promise<ResearchPlan> {
    const q = question.toLowerCase();
    const dataset = pickDataset(question, datasets);

    const momentumPeriod = parseInt2(/(\d+)[-\s]?(?:period|bar|hour)/, q, 20);
    const horizon = parseInt2(/horizon\s+of\s+(\d+)|(\d+)[-\s]?step/, q, 1);
    const folds = parseInt2(/(\d+)[-\s]?fold/, q, 4);

    const includeCosts = /transaction cost|costs?|turnover|slippage|fees?/.test(q);
    const allowShort = !/long[-\s]?only/.test(q);

    const featureConfig = FeatureConfigSchema.parse({
      momentumPeriod,
      volatilityWindow: momentumPeriod,
      horizon: Math.max(1, horizon),
    });
    const windowConfig = WindowConfigSchema.parse({
      folds: Math.min(Math.max(folds, 2), 8),
      mode: /rolling/.test(q) ? "rolling" : "expanding",
      embargo: Math.max(1, featureConfig.horizon),
    });
    const strategyConfig = StrategyConfigSchema.parse({ allowShort });
    const costConfig = CostConfigSchema.parse(
      includeCosts ? {} : { costBps: 0, slippageBps: 0 },
    );

    const models = parseModels(question);

    const notes: string[] = [
      `Interpreted target dataset as "${dataset.name}" (${dataset.id}@${dataset.version}).`,
      `Momentum lookback set to ${momentumPeriod} bars; forward horizon ${featureConfig.horizon} bar(s).`,
      `Validation: ${windowConfig.folds}-fold ${windowConfig.mode} walk-forward with embargo ${windowConfig.embargo}.`,
      includeCosts
        ? `Transaction costs enabled (${costConfig.costBps}bps + ${costConfig.slippageBps}bps slippage).`
        : "No transaction costs requested; backtest reports gross of costs.",
      `Models under comparison: ${models.join(", ")} (baseline always included).`,
    ];

    return {
      datasetId: dataset.id,
      version: dataset.version,
      hypothesis:
        `A ${momentumPeriod}-period momentum signal carries predictive value for the ` +
        `${featureConfig.horizon}-bar forward return on ${dataset.symbol}, evaluated under ` +
        `leakage-safe walk-forward validation${includeCosts ? " and net of transaction costs" : ""}.`,
      featureConfig,
      windowConfig,
      models,
      includeCosts,
      strategyConfig,
      costConfig,
      notes,
    };
  }

  async narrate(context: NarrationContext): Promise<string> {
    const { agentId, facts } = context;
    switch (agentId) {
      case "data-agent":
        return (
          "Inspecting schema, timestamp integrity and missingness, then running a " +
          "correlation-based leakage scan before any modelling is permitted."
        );
      case "research-agent":
        return (
          "Fixing the hypothesis and validation design up front so success cannot be " +
          "declared post hoc. Baseline is evaluated before any complex model."
        );
      case "ml-agent":
        return (
          `Training approved models over walk-forward folds and recording pooled ` +
          `out-of-sample metrics${facts.model ? ` (current: ${facts.model})` : ""}.`
        );
      case "quant-agent":
        return (
          "Converting probabilities to positions with a dead-band, then booking " +
          "realised forward returns net of turnover costs — no future information used."
        );
      case "critic-agent":
        return (
          "Attempting to falsify the result: checking sample size, base-rate-relative " +
          "accuracy, information-coefficient sign, train/test gap and cost sensitivity."
        );
      case "reporter-agent":
        return (
          "Assembling an evidence report strictly from recorded tool outputs; every " +
          "metric is traceable to a deterministic tool call."
        );
      default:
        return "Coordinating the workflow and enforcing state transitions.";
    }
  }
}
