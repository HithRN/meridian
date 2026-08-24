/**
 * The tool catalog.
 *
 * Registers every deterministic capability agents may call, each with a strict
 * Zod input/output contract. Handlers delegate to the numerical kernels and
 * never invent numbers. Registration is idempotent per module load (guarded in
 * `index.ts`).
 */

import { z } from "zod";
import { registerTool } from "@/core/tools/registry";
import type { ToolContext } from "@/core/tools/types";
import {
  DatasetRefSchema,
  FeatureConfigSchema,
  WindowConfigSchema,
  ModelConfigSchema,
  StrategyConfigSchema,
  CostConfigSchema,
} from "@/core/schemas/configs";
import {
  ExperimentRecordSchema,
  ClassificationMetricsSchema,
  BacktestSummarySchema,
} from "@/core/schemas/experiment";
import {
  getDataset,
  listDatasets,
  datasetExists,
  DatasetNotFoundError,
} from "@/core/data/dataset";
import { profileDataset } from "@/core/data/profile";
import { buildFeatures } from "@/core/ml/features";
import { walkForwardSplit } from "@/core/ml/splits";
import { runPipeline, type PipelineInput } from "@/core/ml/pipeline";
import { runBacktest } from "@/core/backtest/engine";
import { driftCheck } from "@/core/monitoring/drift";
import {
  listRepoFiles,
  readRepoFile,
  validatePatch,
  diffSummary,
  runSandboxTests,
} from "@/core/coding/sandbox";
import { hashValue } from "@/core/hash";
import { versionManifest, EXPERIMENT_SCHEMA_VERSION } from "@/core/version";

function assertDataset(id: string, version: string): void {
  if (!datasetExists(id, version)) throw new DatasetNotFoundError(id, version);
}

function clampFeatureConfig(cfg: z.infer<typeof FeatureConfigSchema>) {
  return cfg;
}

// ---------------------------------------------------------------------------
// list_datasets
// ---------------------------------------------------------------------------
registerTool({
  name: "list_datasets",
  title: "List datasets",
  description: "Enumerate the bundled market datasets available to the platform.",
  permission: "read-data",
  deterministic: true,
  input: z.object({ includeFixtures: z.boolean().default(false) }).strict(),
  output: z.object({
    datasets: z.array(
      z.object({
        id: z.string(),
        version: z.string(),
        name: z.string(),
        symbol: z.string(),
        frequency: z.string(),
        description: z.string(),
        rows: z.number(),
        start: z.number(),
        end: z.number(),
        contentHash: z.string(),
        leakageFixture: z.boolean(),
      }),
    ),
  }),
  handler: (input) => ({ datasets: listDatasets(input.includeFixtures) }),
});

// ---------------------------------------------------------------------------
// load_dataset
// ---------------------------------------------------------------------------
registerTool({
  name: "load_dataset",
  title: "Load dataset",
  description:
    "Load a bundled dataset's schema, row count, provenance metadata and a small sample of bars.",
  permission: "read-data",
  deterministic: true,
  input: DatasetRefSchema.strict(),
  output: z.object({
    datasetId: z.string(),
    version: z.string(),
    name: z.string(),
    symbol: z.string(),
    frequency: z.string(),
    contentHash: z.string(),
    rows: z.number(),
    schema: z.array(z.object({ name: z.string(), type: z.string() })),
    sample: z.array(
      z.object({
        t: z.number(),
        open: z.number(),
        high: z.number(),
        low: z.number(),
        close: z.number(),
        volume: z.number(),
      }),
    ),
  }),
  handler: (input, ctx: ToolContext) => {
    assertDataset(input.datasetId, input.version);
    const ds = getDataset(input.datasetId, input.version);
    const rows = Math.min(ds.bars.length, ctx.limits.maxRows);
    return {
      datasetId: ds.id,
      version: ds.version,
      name: ds.name,
      symbol: ds.symbol,
      frequency: ds.frequency,
      contentHash: ds.contentHash,
      rows,
      schema: [
        { name: "t", type: "epoch_ms" },
        { name: "open", type: "float" },
        { name: "high", type: "float" },
        { name: "low", type: "float" },
        { name: "close", type: "float" },
        { name: "volume", type: "int" },
      ],
      sample: ds.bars.slice(0, 24),
    };
  },
});

// ---------------------------------------------------------------------------
// profile_dataset
// ---------------------------------------------------------------------------
registerTool({
  name: "profile_dataset",
  title: "Profile dataset",
  description:
    "Compute missingness, duplicates, ranges, timestamp integrity and a leakage scan for a dataset.",
  permission: "read-data",
  deterministic: true,
  input: DatasetRefSchema.strict(),
  output: z.object({
    datasetId: z.string(),
    version: z.string(),
    contentHash: z.string(),
    passed: z.boolean(),
    timestamps: z.object({
      rows: z.number(),
      monotonic: z.boolean(),
      duplicateTimestamps: z.number(),
      expectedIntervalMs: z.number(),
      irregularGaps: z.number(),
      start: z.number(),
      end: z.number(),
    }),
    ranges: z.array(
      z.object({
        column: z.string(),
        min: z.number(),
        max: z.number(),
        mean: z.number(),
        missing: z.number(),
      }),
    ),
    ohlc: z.object({
      invalidHighLow: z.number(),
      nonPositivePrices: z.number(),
      zeroVolumeBars: z.number(),
    }),
    duplicateRows: z.number(),
    leakage: z.array(
      z.object({
        feature: z.string(),
        correlationWithFuture: z.number(),
        severity: z.enum(["critical", "warning"]),
        explanation: z.string(),
      }),
    ),
    warnings: z.array(z.string()),
  }),
  handler: (input) => {
    assertDataset(input.datasetId, input.version);
    const ds = getDataset(input.datasetId, input.version);
    const meta = listDatasets(true).find(
      (m) => m.id === ds.id && m.version === ds.version,
    );
    return profileDataset(ds, meta?.leakageFixture ?? false);
  },
});

// ---------------------------------------------------------------------------
// create_features
// ---------------------------------------------------------------------------
registerTool({
  name: "create_features",
  title: "Create features",
  description:
    "Construct a leakage-safe feature set from a dataset using the supplied feature configuration.",
  permission: "experiment",
  deterministic: true,
  input: z
    .object({
      datasetId: z.string().min(1),
      version: z.string().default("1.0.0"),
      featureConfig: FeatureConfigSchema.default(FeatureConfigSchema.parse({})),
    })
    .strict(),
  output: z.object({
    featureSetId: z.string(),
    datasetId: z.string(),
    version: z.string(),
    featureNames: z.array(z.string()),
    rows: z.number(),
    horizon: z.number(),
    labelBaseRate: z.number(),
    config: FeatureConfigSchema,
    sample: z.array(
      z.object({ t: z.number(), features: z.array(z.number()), label: z.number() }),
    ),
  }),
  handler: (input) => {
    assertDataset(input.datasetId, input.version);
    const ds = getDataset(input.datasetId, input.version);
    const cfg = clampFeatureConfig(input.featureConfig);
    const fs = buildFeatures(ds.bars, cfg);
    const base =
      fs.rows.length > 0
        ? fs.rows.reduce((a, r) => a + r.label, 0) / fs.rows.length
        : 0;
    return {
      featureSetId: `fs_${hashValue({ id: ds.id, version: ds.version, cfg }).slice(0, 12)}`,
      datasetId: ds.id,
      version: ds.version,
      featureNames: fs.featureNames,
      rows: fs.rows.length,
      horizon: cfg.horizon,
      labelBaseRate: Math.round(base * 1e4) / 1e4,
      config: cfg,
      sample: fs.rows.slice(0, 12).map((r) => ({
        t: r.t,
        features: r.features.map((x) => Math.round(x * 1e6) / 1e6),
        label: r.label,
      })),
    };
  },
});

// ---------------------------------------------------------------------------
// walk_forward_split
// ---------------------------------------------------------------------------
registerTool({
  name: "walk_forward_split",
  title: "Walk-forward split",
  description:
    "Produce ordered, embargoed walk-forward train/validation/test windows for a feature set.",
  permission: "experiment",
  deterministic: true,
  input: z
    .object({
      datasetId: z.string().min(1),
      version: z.string().default("1.0.0"),
      featureConfig: FeatureConfigSchema.default(FeatureConfigSchema.parse({})),
      windowConfig: WindowConfigSchema.default(WindowConfigSchema.parse({})),
    })
    .strict(),
  output: z.object({
    splitId: z.string(),
    totalRows: z.number(),
    mode: z.string(),
    embargo: z.number(),
    windows: z.array(
      z.object({
        fold: z.number(),
        trainStart: z.number(),
        trainEnd: z.number(),
        testStart: z.number(),
        testEnd: z.number(),
      }),
    ),
  }),
  handler: (input, ctx) => {
    assertDataset(input.datasetId, input.version);
    const ds = getDataset(input.datasetId, input.version);
    const fs = buildFeatures(ds.bars, input.featureConfig);
    const win = { ...input.windowConfig, folds: Math.min(input.windowConfig.folds, ctx.limits.maxFolds) };
    const plan = walkForwardSplit(fs.rows.length, win);
    return {
      splitId: `sp_${hashValue({ id: ds.id, version: ds.version, cfg: input.featureConfig, win }).slice(0, 12)}`,
      totalRows: plan.totalRows,
      mode: plan.config.mode,
      embargo: plan.config.embargo,
      windows: plan.windows,
    };
  },
});

// ---------------------------------------------------------------------------
// train_model
// ---------------------------------------------------------------------------
const PipelineInputSchema = z
  .object({
    datasetId: z.string().min(1),
    version: z.string().default("1.0.0"),
    featureConfig: FeatureConfigSchema.default(FeatureConfigSchema.parse({})),
    windowConfig: WindowConfigSchema.default(WindowConfigSchema.parse({})),
    modelConfig: ModelConfigSchema,
  })
  .strict();

function toPipelineInput(i: z.infer<typeof PipelineInputSchema>, ctx: ToolContext): PipelineInput {
  return {
    datasetId: i.datasetId,
    version: i.version,
    featureConfig: i.featureConfig,
    windowConfig: { ...i.windowConfig, folds: Math.min(i.windowConfig.folds, ctx.limits.maxFolds) },
    modelConfig: {
      ...i.modelConfig,
      epochs: i.modelConfig.epochs ? Math.min(i.modelConfig.epochs, ctx.limits.maxEpochs) : undefined,
      seed: i.modelConfig.seed ?? ctx.seed,
    },
  };
}

registerTool({
  name: "train_model",
  title: "Train model",
  description:
    "Train an approved model over walk-forward folds and return its identity, hyperparameters and artifact metadata.",
  permission: "experiment",
  deterministic: true,
  input: PipelineInputSchema,
  output: z.object({
    modelId: z.string(),
    modelType: z.enum(["majority", "logistic", "gbt"]),
    hyperparameters: z.record(z.string(), z.union([z.number(), z.string()])),
    featureSetId: z.string(),
    splitId: z.string(),
    trainedFolds: z.number(),
    artifact: z.object({
      weightsHash: z.string(),
      seed: z.number(),
      kernelVersion: z.string(),
    }),
  }),
  handler: (input, ctx) => {
    assertDataset(input.datasetId, input.version);
    const res = runPipeline(toPipelineInput(input, ctx));
    return {
      modelId: res.modelId,
      modelType: res.modelType,
      hyperparameters: res.hyperparameters,
      featureSetId: res.featureSetId,
      splitId: res.splitId,
      trainedFolds: res.folds.length,
      artifact: {
        weightsHash: hashValue(res.hyperparameters).slice(0, 16),
        seed: input.modelConfig.seed ?? ctx.seed,
        kernelVersion: versionManifest().kernel,
      },
    };
  },
});

// ---------------------------------------------------------------------------
// evaluate_model
// ---------------------------------------------------------------------------
registerTool({
  name: "evaluate_model",
  title: "Evaluate model",
  description:
    "Evaluate a model on pooled out-of-sample walk-forward predictions and return classification metrics and a confusion matrix.",
  permission: "experiment",
  deterministic: true,
  input: PipelineInputSchema,
  output: z.object({
    modelId: z.string(),
    modelType: z.enum(["majority", "logistic", "gbt"]),
    aggregate: ClassificationMetricsSchema,
    folds: z.array(
      z.object({
        fold: z.number(),
        trainRows: z.number(),
        testRows: z.number(),
        metrics: ClassificationMetricsSchema,
      }),
    ),
    oosCount: z.number(),
  }),
  handler: (input, ctx) => {
    assertDataset(input.datasetId, input.version);
    const res = runPipeline(toPipelineInput(input, ctx));
    return {
      modelId: res.modelId,
      modelType: res.modelType,
      aggregate: res.aggregate,
      folds: res.folds,
      oosCount: res.oos.length,
    };
  },
});

// ---------------------------------------------------------------------------
// backtest
// ---------------------------------------------------------------------------
registerTool({
  name: "backtest",
  title: "Backtest",
  description:
    "Convert a model's out-of-sample predictions into positions and run a cost-aware backtest (Sharpe, drawdown, turnover, costs).",
  permission: "backtest",
  deterministic: true,
  input: PipelineInputSchema.extend({
    strategyConfig: StrategyConfigSchema.default(StrategyConfigSchema.parse({})),
    costConfig: CostConfigSchema.default(CostConfigSchema.parse({})),
  }).strict(),
  output: z.object({
    modelId: z.string(),
    summary: BacktestSummarySchema,
    periods: z.number(),
    equityCurve: z.array(
      z.object({
        t: z.number(),
        equity: z.number(),
        drawdown: z.number(),
        position: z.number(),
        netReturn: z.number(),
      }),
    ),
  }),
  handler: (input, ctx) => {
    assertDataset(input.datasetId, input.version);
    const res = runPipeline(toPipelineInput(input, ctx));
    const bt = runBacktest(
      res.oos.map((p) => ({ proba: p.proba, forwardReturn: p.forwardReturn, t: p.t })),
      input.strategyConfig,
      input.costConfig,
    );
    // Downsample the equity curve for transport (keep <= 500 points).
    const step = Math.max(1, Math.floor(bt.equityCurve.length / 500));
    const curve = bt.equityCurve
      .filter((_, i) => i % step === 0)
      .map((p) => ({
        t: p.t,
        equity: p.equity,
        drawdown: p.drawdown,
        position: p.position,
        netReturn: p.netReturn,
      }));
    return {
      modelId: res.modelId,
      periods: bt.periods,
      summary: {
        totalReturn: bt.totalReturn,
        annualisedReturn: bt.annualisedReturn,
        annualisedVolatility: bt.annualisedVolatility,
        sharpe: bt.sharpe,
        sortino: bt.sortino,
        maxDrawdown: bt.maxDrawdown,
        turnover: bt.turnover,
        totalCostBps: bt.totalCostBps,
        hitRate: bt.hitRate,
        exposure: bt.exposure,
        benchmarkReturn: bt.benchmarkReturn,
      },
      equityCurve: curve,
    };
  },
});

// ---------------------------------------------------------------------------
// drift_check
// ---------------------------------------------------------------------------
registerTool({
  name: "drift_check",
  title: "Drift check",
  description:
    "Compare the distribution of a reference window against a current window and report PSI-based drift.",
  permission: "monitoring",
  deterministic: true,
  input: z
    .object({
      datasetId: z.string().min(1),
      version: z.string().default("1.0.0"),
      featureConfig: FeatureConfigSchema.default(FeatureConfigSchema.parse({})),
      referenceFraction: z.number().min(0.2).max(0.8).default(0.5),
    })
    .strict(),
  output: z.object({
    status: z.enum(["stable", "moderate", "significant"]),
    maxPsi: z.number(),
    metrics: z.array(
      z.object({
        name: z.string(),
        psi: z.number(),
        meanShift: z.number(),
        stdRatio: z.number(),
        status: z.enum(["stable", "moderate", "significant"]),
      }),
    ),
    warnings: z.array(z.string()),
  }),
  handler: (input) => {
    assertDataset(input.datasetId, input.version);
    const ds = getDataset(input.datasetId, input.version);
    const fs = buildFeatures(ds.bars, input.featureConfig);
    const cut = Math.floor(fs.rows.length * input.referenceFraction);
    const reference: Record<string, number[]> = {};
    const current: Record<string, number[]> = {};
    fs.featureNames.forEach((name, j) => {
      reference[name] = fs.rows.slice(0, cut).map((r) => r.features[j]);
      current[name] = fs.rows.slice(cut).map((r) => r.features[j]);
    });
    reference["forward_return"] = fs.rows.slice(0, cut).map((r) => r.forwardReturn);
    current["forward_return"] = fs.rows.slice(cut).map((r) => r.forwardReturn);
    const report = driftCheck(reference, current);
    return {
      status: report.status,
      maxPsi: report.maxPsi,
      metrics: report.metrics,
      warnings: report.warnings,
    };
  },
});

// ---------------------------------------------------------------------------
// record_experiment
// ---------------------------------------------------------------------------
registerTool({
  name: "record_experiment",
  title: "Record experiment",
  description:
    "Validate and finalise an experiment record, assigning identity, schema version and provenance.",
  permission: "experiment",
  deterministic: true,
  input: ExperimentRecordSchema.omit({
    id: true,
    createdAt: true,
    schemaVersion: true,
    versions: true,
  }),
  output: z.object({ experimentId: z.string(), record: ExperimentRecordSchema }),
  handler: (input) => {
    const createdAt = 0; // deterministic; the store overwrites with wall-clock on persist
    const id = `exp_${hashValue(input).slice(0, 12)}`;
    const record = ExperimentRecordSchema.parse({
      ...input,
      id,
      createdAt,
      schemaVersion: EXPERIMENT_SCHEMA_VERSION,
      versions: versionManifest(),
    });
    return { experimentId: id, record };
  },
});

// ---------------------------------------------------------------------------
// inspect_repo (coding, read-only)
// ---------------------------------------------------------------------------
registerTool({
  name: "inspect_repo",
  title: "Inspect repository",
  description:
    "List whitelisted sandbox files or read one file's contents. Read-only; cannot touch the real filesystem.",
  permission: "coding-readonly",
  deterministic: true,
  input: z.object({ path: z.string().optional() }).strict(),
  output: z.object({
    files: z
      .array(z.object({ path: z.string(), language: z.string(), description: z.string() }))
      .optional(),
    file: z
      .object({
        path: z.string(),
        language: z.string(),
        description: z.string(),
        contents: z.string(),
      })
      .optional(),
  }),
  handler: (input) => {
    if (input.path) return { file: readRepoFile(input.path) };
    return { files: listRepoFiles() };
  },
});

// ---------------------------------------------------------------------------
// propose_patch (coding, restricted)
// ---------------------------------------------------------------------------
registerTool({
  name: "propose_patch",
  title: "Propose patch",
  description:
    "Validate a bounded patch against a single whitelisted file and return a diff summary. Never applies to disk.",
  permission: "coding-restricted",
  deterministic: true,
  input: z.object({ path: z.string(), proposedContents: z.string() }).strict(),
  output: z.object({
    path: z.string(),
    accepted: z.boolean(),
    added: z.number(),
    removed: z.number(),
    preview: z.string(),
  }),
  handler: (input) => {
    validatePatch(input);
    const diff = diffSummary(input);
    return { path: input.path, accepted: true, added: diff.added, removed: diff.removed, preview: diff.preview };
  },
});

// ---------------------------------------------------------------------------
// run_tests (coding, restricted)
// ---------------------------------------------------------------------------
registerTool({
  name: "run_tests",
  title: "Run tests",
  description:
    "Run the sandbox test suite against the current repo or a proposed patch. Deterministic, no shell execution.",
  permission: "coding-restricted",
  deterministic: true,
  input: z
    .object({
      patch: z.object({ path: z.string(), proposedContents: z.string() }).optional(),
    })
    .strict(),
  output: z.object({
    total: z.number(),
    passed: z.number(),
    failed: z.number(),
    allPassed: z.boolean(),
    outcomes: z.array(z.object({ name: z.string(), passed: z.boolean() })),
  }),
  handler: (input) => {
    if (input.patch) validatePatch(input.patch);
    return runSandboxTests(input.patch);
  },
});
