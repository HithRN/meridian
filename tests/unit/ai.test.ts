import { describe, expect, it } from "vitest";
import { getLab } from "@/core/ai/lab";
import { logit } from "@/core/ai/models";
import { minTipForTarget, shapExact } from "@/core/ai/explain";
import { SCENARIOS, generateBundles, trueLogit } from "@/core/ai/bundles";
import { sigmoid } from "@/core/ml/stats";

describe("bundle-landing AI lab", () => {
  const lab = getLab();

  it("generates a reproducible dataset", () => {
    expect(generateBundles(200, 1)).toEqual(generateBundles(200, 1));
    expect(lab.split.baseRate).toBeGreaterThan(0.3);
    expect(lab.split.baseRate).toBeLessThan(0.8);
  });

  it("trains models that beat logistic regression and approach the oracle", () => {
    const m = lab.metrics;
    expect(m.gbt.auc).toBeGreaterThan(m.logistic.auc);
    expect(m.mlp.auc).toBeGreaterThan(m.logistic.auc);
    expect(m.oracle.auc - m.gbt.auc).toBeLessThan(0.03);
    expect(m.gbt.ece).toBeLessThan(0.05);
  });

  it("satisfies Shapley efficiency: base + Σφ = model log-odds", () => {
    const x = SCENARIOS[0].x;
    const f = (z: number[]) => logit(lab.models.gbt, z);
    const e = shapExact(f, x, lab.background);
    const sum = e.base + e.phi.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(f([...x]), 8);
  });

  it("produces explanations faithful to the ground-truth mechanism", () => {
    for (const id of ["gbt", "mlp"] as const) {
      expect(lab.faithfulness[id].globalCosine).toBeGreaterThan(0.95);
      expect(lab.faithfulness[id].localCosine).toBeGreaterThan(0.9);
      expect(lab.faithfulness[id].top3Overlap).toBeGreaterThanOrEqual(2 / 3);
    }
    // Tip and state drift are the dominant true drivers; models must agree.
    const top = (v: number[]) => v.indexOf(Math.max(...v));
    expect(top(lab.importance.gbt)).toBe(top(lab.importance.truth));
  });

  it("finds a counterfactual tip that reaches the target", () => {
    const f = (z: number[]) => logit(lab.models.gbt, z);
    const x = SCENARIOS[0].x;
    const t = minTipForTarget(f, x, 0.9);
    expect(t).not.toBeNull();
    const z = [...x];
    z[0] = t!;
    expect(sigmoid(f(z))).toBeGreaterThanOrEqual(0.9);
    // A stale, oversized bundle cannot be rescued by tip under the true mechanism.
    expect(minTipForTarget(trueLogit, [6, 0.5, 4, 10, 5, 3, 20, 1], 0.95)).toBeNull();
  });
});
