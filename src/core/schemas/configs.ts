/**
 * Zod schemas for the configuration objects that flow through tools.
 *
 * These are the runtime enforcement of the "strict input schema" requirement:
 * every field is bounded, defaulted, and rejected if unknown. The public
 * execution limits are additionally applied inside the tool handlers.
 */

import { z } from "zod";

export const ModelTypeSchema = z.enum(["majority", "logistic", "gbt"]);

export const DatasetRefSchema = z.object({
  datasetId: z.string().min(1),
  version: z.string().default("1.0.0"),
});

export const FeatureConfigSchema = z
  .object({
    momentumPeriod: z.number().int().min(2).max(200).default(20),
    volatilityWindow: z.number().int().min(2).max(200).default(20),
    rsiPeriod: z.number().int().min(2).max(100).default(14),
    horizon: z.number().int().min(1).max(24).default(1),
    labelThreshold: z.number().min(-0.05).max(0.05).default(0),
  })
  .strict();

export const WindowConfigSchema = z
  .object({
    folds: z.number().int().min(2).max(8).default(4),
    testFraction: z.number().min(0.05).max(0.5).default(0.2),
    embargo: z.number().int().min(0).max(50).default(1),
    mode: z.enum(["expanding", "rolling"]).default("expanding"),
  })
  .strict();

export const ModelConfigSchema = z
  .object({
    type: ModelTypeSchema,
    l2: z.number().min(0).max(100).optional(),
    learningRate: z.number().min(0.001).max(2).optional(),
    epochs: z.number().int().min(10).max(800).optional(),
    rounds: z.number().int().min(1).max(300).optional(),
    shrinkage: z.number().min(0.01).max(1).optional(),
    seed: z.number().int().default(42),
  })
  .strict();

export const StrategyConfigSchema = z
  .object({
    band: z.number().min(0).max(0.45).default(0.02),
    allowShort: z.boolean().default(true),
    maxPosition: z.number().min(0.1).max(3).default(1),
    sizing: z.enum(["binary", "proportional"]).default("proportional"),
  })
  .strict();

export const CostConfigSchema = z
  .object({
    costBps: z.number().min(0).max(200).default(5),
    slippageBps: z.number().min(0).max(200).default(2),
  })
  .strict();

export type FeatureConfigInput = z.input<typeof FeatureConfigSchema>;
export type WindowConfigInput = z.input<typeof WindowConfigSchema>;
export type ModelConfigInput = z.input<typeof ModelConfigSchema>;
