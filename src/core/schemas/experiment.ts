/**
 * Experiment record schema.
 *
 * The unit of MLOps bookkeeping. Every record is self-describing and
 * reproducible: it pins the dataset (id + version + content hash), the exact
 * feature/split/model configuration, the random seed, the platform/kernel
 * versions, the metrics that were actually measured, and the critic's verdict.
 * Given a record you can reconstruct the run byte-for-byte.
 */

import { z } from "zod";
import {
  FeatureConfigSchema,
  WindowConfigSchema,
  StrategyConfigSchema,
  CostConfigSchema,
} from "@/core/schemas/configs";

export const ClassificationMetricsSchema = z.object({
  n: z.number(),
  accuracy: z.number(),
  precision: z.number(),
  recall: z.number(),
  f1: z.number(),
  auc: z.number(),
  logLoss: z.number(),
  baseRate: z.number(),
  informationCoefficient: z.number(),
  confusion: z.object({
    truePositive: z.number(),
    falsePositive: z.number(),
    trueNegative: z.number(),
    falseNegative: z.number(),
  }),
});

export const BacktestSummarySchema = z.object({
  totalReturn: z.number(),
  annualisedReturn: z.number(),
  annualisedVolatility: z.number(),
  sharpe: z.number(),
  sortino: z.number(),
  maxDrawdown: z.number(),
  turnover: z.number(),
  totalCostBps: z.number(),
  hitRate: z.number(),
  exposure: z.number(),
  benchmarkReturn: z.number(),
});

export const ModelResultSchema = z.object({
  modelId: z.string(),
  modelType: z.enum(["majority", "logistic", "gbt"]),
  hyperparameters: z.record(z.string(), z.union([z.number(), z.string()])),
  metrics: ClassificationMetricsSchema,
  backtest: BacktestSummarySchema.optional(),
});

export const VersionManifestSchema = z.object({
  platform: z.string(),
  toolRuntime: z.string(),
  experimentSchema: z.string(),
  kernel: z.string(),
  gitCommit: z.string(),
});

export const CritiqueSchema = z.object({
  passed: z.boolean(),
  severity: z.enum(["none", "low", "medium", "high"]),
  findings: z.array(
    z.object({
      code: z.string(),
      severity: z.enum(["low", "medium", "high"]),
      message: z.string(),
    }),
  ),
});

export const ExperimentRecordSchema = z.object({
  id: z.string(),
  schemaVersion: z.string(),
  createdAt: z.number(),
  question: z.string(),
  status: z.enum(["candidate", "evaluated", "approved-for-demo", "archived"]),
  dataset: z.object({
    datasetId: z.string(),
    version: z.string(),
    contentHash: z.string(),
    rows: z.number(),
  }),
  seed: z.number(),
  featureConfig: FeatureConfigSchema,
  windowConfig: WindowConfigSchema,
  strategyConfig: StrategyConfigSchema.optional(),
  costConfig: CostConfigSchema.optional(),
  models: z.array(ModelResultSchema),
  bestModelId: z.string().optional(),
  baselineModelId: z.string().optional(),
  critique: CritiqueSchema.optional(),
  warnings: z.array(z.string()),
  versions: VersionManifestSchema,
  /** Number of audited tool calls that produced this record. */
  toolCalls: z.number(),
});

export type ExperimentRecord = z.infer<typeof ExperimentRecordSchema>;
export type ModelResult = z.infer<typeof ModelResultSchema>;
export type Critique = z.infer<typeof CritiqueSchema>;
export type BacktestSummary = z.infer<typeof BacktestSummarySchema>;
