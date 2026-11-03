/**
 * Solana · Jito tool catalog.
 *
 * Read-only tools over Jito's public mainnet APIs plus the conformal tip
 * advisor and JitoSOL yield maths. They share the registry's contract (strict
 * Zod schemas, audit trail, structured errors), so the AI copilot can call them
 * exactly like the research tools. Network-backed tools are marked
 * non-deterministic and report whether their figures are live or bundled.
 */

import { z } from "zod";
import { registerTool } from "@/core/tools/registry";
import { fetchStakePoolStats, fetchTipFloor } from "@/core/solana/live";
import { EVAL_CONFIDENCES, getTipAdvisor, type TipLevel } from "@/core/solana/tips";
import { BUNDLED_STAKE_POOL, mevApyEstimate, projectJitoSolYield } from "@/core/solana/staking";
import { DEFAULT_BUNDLE, FEATURES } from "@/core/ai/bundles";
import { getLab } from "@/core/ai/lab";
import { logit } from "@/core/ai/models";
import { minTipForTarget, shapExact } from "@/core/ai/explain";
import { sigmoid } from "@/core/ml/stats";

const SourceSchema = z.enum(["live", "snapshot"]);
const LevelSchema = z.union([z.literal(25), z.literal(50), z.literal(75), z.literal(95), z.literal(99)]);

const TipFloorSchema = z.object({
  time: z.string(),
  p25: z.number(),
  p50: z.number(),
  p75: z.number(),
  p95: z.number(),
  p99: z.number(),
  emaP50: z.number(),
});

// ---------------------------------------------------------------------------
// jito_tip_floor
// ---------------------------------------------------------------------------
registerTool({
  name: "jito_tip_floor",
  title: "Jito tip floor",
  description:
    "Current landed-bundle tip percentiles (SOL) from Jito's block engine. Falls back to a bundled snapshot when offline.",
  permission: "network-read",
  deterministic: false,
  input: z.object({}).strict(),
  output: z.object({ tipFloor: TipFloorSchema, source: SourceSchema, fetchedAt: z.number() }),
  handler: async () => {
    const r = await fetchTipFloor();
    return { tipFloor: r.data, source: r.source, fetchedAt: r.fetchedAt };
  },
});

// ---------------------------------------------------------------------------
// recommend_bundle_tip
// ---------------------------------------------------------------------------
registerTool({
  name: "recommend_bundle_tip",
  title: "Recommend bundle tip",
  description:
    "Conformal forecast of the tip needed to outbid `level`% of bundles landing next hour with probability `confidence`. " +
    "Anchored on the live tip floor when available; residual quantiles are regime-conditioned and calibrated on bundled history. " +
    "Returns the walk-forward coverage of the method at that level.",
  permission: "network-read",
  deterministic: false,
  input: z
    .object({
      level: LevelSchema.default(75),
      confidence: z.number().min(0.05).max(0.99).default(0.8),
      useLive: z.boolean().default(true),
    })
    .strict(),
  output: z.object({
    tipSol: z.number(),
    tipLamports: z.number().int(),
    level: z.number(),
    confidence: z.number(),
    regime: z.enum(["calm", "normal", "hot"]),
    anchorSol: z.number(),
    anchorSource: z.enum(["live", "bundled-history"]),
    globalTipSol: z.number(),
    calibrationHours: z.number(),
    validation: z.object({
      evaluatedConfidence: z.number(),
      coverage: z.number(),
      coverageNaive: z.number(),
      coverageHot: z.number(),
      coverageHotGlobal: z.number(),
      medianOverpay: z.number(),
      testedHours: z.number(),
      folds: z.number(),
    }),
  }),
  handler: async (input) => {
    const advisor = getTipAdvisor();
    const live = input.useLive ? await fetchTipFloor() : null;
    const rec = advisor.recommend(input.level as TipLevel, input.confidence, live?.source === "live" ? live.data : null);
    const nearest = EVAL_CONFIDENCES.reduce((a, b) =>
      Math.abs(b - input.confidence) < Math.abs(a - input.confidence) ? b : a,
    );
    const row = advisor.backtest.rows.find((r) => r.level === input.level && r.confidence === nearest)!;
    return {
      ...rec,
      validation: {
        evaluatedConfidence: nearest,
        coverage: row.coverage,
        coverageNaive: row.coverageNaive,
        coverageHot: row.coverageHot,
        coverageHotGlobal: row.coverageHotGlobal,
        medianOverpay: row.medianOverpay,
        testedHours: row.tested,
        folds: advisor.backtest.folds,
      },
    };
  },
});

// ---------------------------------------------------------------------------
// jitosol_stats
// ---------------------------------------------------------------------------
registerTool({
  name: "jitosol_stats",
  title: "JitoSOL stake-pool stats",
  description:
    "JitoSOL APY, estimated MEV share of APY, TVL, supply, validator count and recent daily MEV rewards from Jito's stake-pool API.",
  permission: "network-read",
  deterministic: false,
  input: z.object({}).strict(),
  output: z.object({
    apy: z.number(),
    mevApyEstimate: z.number(),
    tvlSol: z.number(),
    supplyJitoSol: z.number(),
    numValidators: z.number(),
    mevRewardsSol: z.array(z.object({ date: z.string(), value: z.number() })),
    source: SourceSchema,
    asOf: z.string(),
  }),
  handler: async () => {
    const { data } = await fetchStakePoolStats();
    return {
      apy: data.apy,
      mevApyEstimate: mevApyEstimate(data),
      tvlSol: data.tvlSol,
      supplyJitoSol: data.supplyJitoSol,
      numValidators: data.numValidators,
      mevRewardsSol: data.mevRewardsSol,
      source: data.source,
      asOf: data.asOf,
    };
  },
});

// ---------------------------------------------------------------------------
// project_jitosol_yield
// ---------------------------------------------------------------------------
registerTool({
  name: "project_jitosol_yield",
  title: "Project JitoSOL yield",
  description:
    "Compound a SOL position at the reported JitoSOL APY for `days`, and compare with the same stake excluding the estimated MEV component.",
  permission: "network-read",
  deterministic: false,
  input: z
    .object({
      amountSol: z.number().positive().max(10_000_000),
      days: z.number().int().min(1).max(3650),
      useLive: z.boolean().default(true),
    })
    .strict(),
  output: z.object({
    amountSol: z.number(),
    days: z.number(),
    apy: z.number(),
    mevApy: z.number(),
    jitoSolEnd: z.number(),
    nativeStakeEnd: z.number(),
    mevUpliftSol: z.number(),
    path: z.array(z.object({ day: z.number(), jitoSol: z.number(), noMev: z.number() })),
    source: SourceSchema,
  }),
  handler: async (input) => {
    const stats = input.useLive ? (await fetchStakePoolStats()).data : BUNDLED_STAKE_POOL;
    return projectJitoSolYield(stats, input.amountSol, input.days);
  },
});

// ---------------------------------------------------------------------------
// predict_bundle_landing
// ---------------------------------------------------------------------------
const featureInput = Object.fromEntries(
  FEATURES.map((f) => [f.key, z.number().min(f.min).max(f.max).optional().describe(f.description)]),
) as Record<string, z.ZodOptional<z.ZodNumber>>;

registerTool({
  name: "predict_bundle_landing",
  title: "Predict & explain bundle landing",
  description:
    "Predict the probability a Jito bundle lands with a trained ML model (gbt | mlp | logistic) and explain it with exact Shapley values " +
    "(log-odds contribution per feature) plus a counterfactual: the smallest tip (as log2 multiple of the landed p50) that reaches " +
    "`targetProbability`. Unspecified features default to a typical bundle. Models are trained on a documented bundle-auction simulator.",
  permission: "experiment",
  deterministic: true,
  input: z
    .object({
      ...featureInput,
      model: z.enum(["gbt", "mlp", "logistic"]).default("gbt"),
      targetProbability: z.number().min(0.5).max(0.99).default(0.9),
    })
    .strict(),
  output: z.object({
    model: z.string(),
    probability: z.number(),
    baseProbability: z.number(),
    contributions: z.array(
      z.object({ feature: z.string(), label: z.string(), value: z.number(), shapLogOdds: z.number() }),
    ),
    targetProbability: z.number(),
    minTipLog2Multiple: z.number().nullable(),
    minTipTimesP50: z.number().nullable(),
    modelQuality: z.object({ auc: z.number(), ece: z.number(), oracleAuc: z.number(), explanationFaithfulness: z.number() }),
  }),
  handler: (input) => {
    const lab = getLab();
    const raw = input as unknown as Record<string, number | undefined>;
    const x = FEATURES.map((f, j) => raw[f.key] ?? DEFAULT_BUNDLE[j]);
    const model = lab.models[input.model];
    const f = (v: number[]) => logit(model, v);
    const e = shapExact(f, x, lab.background);
    const minTip = minTipForTarget(f, x, input.targetProbability);
    return {
      model: input.model,
      probability: sigmoid(e.value),
      baseProbability: sigmoid(e.base),
      contributions: FEATURES.map((spec, j) => ({ feature: spec.key, label: spec.label, value: x[j], shapLogOdds: e.phi[j] })).sort(
        (a, b) => Math.abs(b.shapLogOdds) - Math.abs(a.shapLogOdds),
      ),
      targetProbability: input.targetProbability,
      minTipLog2Multiple: minTip,
      minTipTimesP50: minTip === null ? null : Math.pow(2, minTip),
      modelQuality: {
        auc: lab.metrics[input.model].auc,
        ece: lab.metrics[input.model].ece,
        oracleAuc: lab.metrics.oracle.auc,
        explanationFaithfulness: lab.faithfulness[input.model].localCosine,
      },
    };
  },
});
