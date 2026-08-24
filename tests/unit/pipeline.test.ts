import { describe, it, expect } from "vitest";
import { FeatureConfigSchema, WindowConfigSchema, ModelConfigSchema } from "@/core/schemas/configs";
import { runPipeline } from "@/core/ml/pipeline";
import { runBacktest, DEFAULT_STRATEGY_CONFIG } from "@/core/backtest/engine";
import { getDataset } from "@/core/data/dataset";

const featureConfig = FeatureConfigSchema.parse({});
const windowConfig = WindowConfigSchema.parse({});

describe("deterministic pipeline", () => {
  it("produces identical results across runs (reproducibility)", () => {
    const input = {
      datasetId: "synthetic-equity-hourly",
      version: "1.0.0",
      featureConfig,
      windowConfig,
      modelConfig: ModelConfigSchema.parse({ type: "logistic" }),
    };
    const a = runPipeline(input);
    const b = runPipeline(input);
    expect(a.aggregate).toEqual(b.aggregate);
    expect(a.modelId).toEqual(b.modelId);
    expect(a.oos.length).toBeGreaterThan(50);
  });

  it("has a stable dataset content hash", () => {
    const d1 = getDataset("synthetic-equity-hourly");
    const d2 = getDataset("synthetic-equity-hourly");
    expect(d1.contentHash).toEqual(d2.contentHash);
    expect(d1.bars.length).toBe(4200);
  });

  it("learners are calibrated (AUC in a sane range)", () => {
    for (const type of ["majority", "logistic", "gbt"] as const) {
      const res = runPipeline({
        datasetId: "synthetic-equity-hourly",
        version: "1.0.0",
        featureConfig,
        windowConfig,
        modelConfig: ModelConfigSchema.parse({ type }),
      });
      expect(res.aggregate.auc).toBeGreaterThanOrEqual(0.4);
      expect(res.aggregate.auc).toBeLessThanOrEqual(0.75);
      expect(res.aggregate.n).toBeGreaterThan(0);
    }
  });

  it("backtest is cost-aware and internally consistent", () => {
    const res = runPipeline({
      datasetId: "synthetic-equity-hourly",
      version: "1.0.0",
      featureConfig,
      windowConfig,
      modelConfig: ModelConfigSchema.parse({ type: "gbt" }),
    });
    const noCost = runBacktest(
      res.oos.map((p) => ({ proba: p.proba, forwardReturn: p.forwardReturn, t: p.t })),
      DEFAULT_STRATEGY_CONFIG,
      { costBps: 0, slippageBps: 0 },
    );
    const withCost = runBacktest(
      res.oos.map((p) => ({ proba: p.proba, forwardReturn: p.forwardReturn, t: p.t })),
      DEFAULT_STRATEGY_CONFIG,
      { costBps: 20, slippageBps: 5 },
    );
    // Costs can only reduce net return.
    expect(withCost.totalReturn).toBeLessThanOrEqual(noCost.totalReturn + 1e-9);
    expect(withCost.totalCostBps).toBeGreaterThan(0);
    expect(noCost.equityCurve.length).toBe(res.oos.length);
  });
});
