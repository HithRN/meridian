import { describe, expect, it } from "vitest";
import {
  generateTipHistory,
  getTipAdvisor,
  MIN_TIP_LAMPORTS,
} from "@/core/solana/tips";
import { BUNDLED_STAKE_POOL, projectJitoSolYield, mevApyEstimate } from "@/core/solana/staking";

describe("Jito tip advisor (Mondrian conformal)", () => {
  it("generates a reproducible history", () => {
    const a = generateTipHistory(500);
    const b = generateTipHistory(500);
    expect(a).toEqual(b);
    for (const bar of a) {
      expect(bar.p25).toBeLessThan(bar.p50);
      expect(bar.p75).toBeGreaterThan(bar.p50);
      expect(bar.p99).toBeGreaterThan(bar.p95);
    }
  });

  it("achieves near-target out-of-sample coverage and beats the naive rule", () => {
    const { backtest } = getTipAdvisor();
    for (const row of backtest.rows) {
      // Conformal coverage should land within a few points of the target.
      expect(Math.abs(row.coverage - row.confidence)).toBeLessThan(0.07);
    }
    const p95at95 = backtest.rows.find((r) => r.level === 95 && r.confidence === 0.95)!;
    expect(p95at95.coverage).toBeGreaterThan(p95at95.coverageNaive);
  });

  it("is at least as well covered in hot regimes as a global quantile", () => {
    const { backtest } = getTipAdvisor();
    const rows = backtest.rows.filter((r) => r.confidence >= 0.8);
    const mondrian = rows.reduce((s, r) => s + r.coverageHot, 0);
    const global = rows.reduce((s, r) => s + r.coverageHotGlobal, 0);
    expect(mondrian).toBeGreaterThanOrEqual(global);
  });

  it("recommends monotone tips and respects the block-engine minimum", () => {
    const adv = getTipAdvisor();
    const lo = adv.recommend(75, 0.5);
    const hi = adv.recommend(75, 0.95);
    expect(hi.tipSol).toBeGreaterThanOrEqual(lo.tipSol);
    expect(adv.recommend(25, 0.05).tipLamports).toBeGreaterThanOrEqual(MIN_TIP_LAMPORTS);
  });

  it("anchors on a live snapshot when one is supplied", () => {
    const adv = getTipAdvisor();
    const rec = adv.recommend(50, 0.8, {
      time: "2026-11-02T00:00:00Z",
      p25: 5e-6, p50: 1e-5, p75: 5e-5, p95: 4e-4, p99: 5e-3, emaP50: 1e-5,
    });
    expect(rec.anchorSource).toBe("live");
    expect(rec.anchorSol).toBeCloseTo(1e-5, 12);
  });
});

describe("JitoSOL yield projection", () => {
  it("compounds and decomposes yield transparently", () => {
    const p = projectJitoSolYield(BUNDLED_STAKE_POOL, 100, 365);
    expect(p.jitoSolEnd).toBeGreaterThan(100);
    expect(p.jitoSolEnd).toBeGreaterThan(p.nativeStakeEnd);
    expect(p.path.length).toBeGreaterThan(10);
    expect(mevApyEstimate(BUNDLED_STAKE_POOL)).toBeGreaterThan(0);
  });
});

describe("copilot deterministic engine", () => {
  it("classifies English and Japanese intents", async () => {
    const { classifyIntent, detectLang } = await import("@/core/copilot/deterministic");
    expect(classifyIntent("What tip should my bundle carry?")).toBe("tip");
    expect(classifyIntent("p95を上回るにはチップはいくら？")).toBe("tip");
    expect(classifyIntent("100 SOLをJitoSOLでステーキングしたら？")).toBe("yield");
    expect(classifyIntent("Test 24-period momentum on SOL")).toBe("research");
    expect(detectLang("チップ")).toBe("ja");
    expect(detectLang("tip")).toBe("en");
  });

  it("answers a tip question from tool output, offline-safe", async () => {
    const { runDeterministicCopilot } = await import("@/core/copilot/deterministic");
    const res = await runDeterministicCopilot([
      { role: "user", content: "What tip outbids p95 with 90% confidence?" },
    ]);
    expect(res.engine).toBe("deterministic");
    expect(res.toolCalls.map((c) => c.name)).toContain("recommend_bundle_tip");
    expect(res.toolCalls.every((c) => c.ok)).toBe(true);
    expect(res.reply).toMatch(/lamports/);
  }, 20000);

  it("exposes registry schemas to the model without $schema keys", async () => {
    const { copilotToolSpecs } = await import("@/core/copilot/tools");
    const specs = copilotToolSpecs();
    expect(specs.map((s) => s.name)).toEqual(
      expect.arrayContaining(["recommend_bundle_tip", "jitosol_stats", "run_quant_research"]),
    );
    for (const s of specs) {
      expect(s.input_schema.type).toBe("object");
      expect("$schema" in s.input_schema).toBe(false);
    }
  });
});

describe("copilot explainable-AI intent", () => {
  it("routes why/explain questions to the landing model, in both languages", async () => {
    const { classifyIntent, runDeterministicCopilot } = await import("@/core/copilot/deterministic");
    expect(classifyIntent("Explain why my liquidation bundle might not land")).toBe("predict");
    expect(classifyIntent("混雑時の清算バンドルはなぜ着地しにくい？説明して")).toBe("predict");
    // The Japanese tip question mentions 確率 but is still a tip question.
    expect(classifyIntent("p95を90%の確率で上回るにはチップはいくら必要ですか？")).toBe("tip");
    const res = await runDeterministicCopilot([{ role: "user", content: "Explain why my liquidation bundle might not land at 2x p50" }]);
    expect(res.toolCalls[0].name).toBe("predict_bundle_landing");
    expect(res.toolCalls[0].ok).toBe(true);
    expect(res.reply).toMatch(/Shapley/);
  }, 30000);
});
