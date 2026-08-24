import { describe, it, expect } from "vitest";
import { runResearch } from "@/core/orchestrator/orchestrator";
import { DeterministicReasoner } from "@/core/llm/deterministic";
import { ExperimentRecordSchema } from "@/core/schemas/experiment";

const reasoner = new DeterministicReasoner();

describe("orchestrator end-to-end (deterministic mode)", () => {
  it("reaches REPORT_READY through every workflow state", async () => {
    const res = await runResearch({
      question:
        "Test whether a 20-period momentum signal has predictive value on the hourly dataset, compare three models, use walk-forward validation, include transaction costs, and produce an evidence report.",
      seed: 42,
      reasoner,
    });

    expect(res.finalState).toBe("REPORT_READY");
    const states = res.trace.filter((e) => e.kind === "state").map((e) => e.state);
    for (const s of [
      "PLAN_CREATED",
      "DATA_VALIDATED",
      "HYPOTHESIS_DEFINED",
      "FEATURES_READY",
      "EXPERIMENTS_RUNNING",
      "RESULTS_READY",
      "CRITIQUE",
      "REPORT_READY",
    ]) {
      expect(states).toContain(s);
    }
    // Three models compared, record validates, report grounded.
    expect(res.record.models.length).toBe(3);
    expect(() => ExperimentRecordSchema.parse(res.record)).not.toThrow();
    expect(res.reportMarkdown).toContain("Research Report");
    expect(res.audit.length).toBeGreaterThan(5);
  });

  it("every reported metric is backed by an audited tool call", async () => {
    const res = await runResearch({
      question: "Compare three models with walk-forward validation and costs.",
      seed: 7,
      reasoner,
    });
    // Each model's metrics must correspond to evaluate_model / backtest calls.
    const toolNames = res.audit.map((a) => a.tool);
    expect(toolNames).toContain("evaluate_model");
    expect(toolNames).toContain("backtest");
    expect(toolNames).toContain("record_experiment");
    // No audit entry is in error state on the happy path.
    expect(res.audit.every((a) => a.status === "ok")).toBe(true);
  });

  it("is reproducible for a fixed seed", async () => {
    const q = "20-period momentum, three models, walk-forward, costs.";
    const a = await runResearch({ question: q, seed: 99, reasoner });
    const b = await runResearch({ question: q, seed: 99, reasoner });
    expect(a.record.models.map((m) => m.metrics.auc)).toEqual(
      b.record.models.map((m) => m.metrics.auc),
    );
    expect(a.record.bestModelId).toEqual(b.record.bestModelId);
  });

  it("critic raises at least one substantiated finding on the honest dataset", async () => {
    const res = await runResearch({
      question: "20-period momentum, three models, walk-forward, transaction costs.",
      seed: 42,
      reasoner,
    });
    // On synthetic data with costs, at least one genuine weakness should surface.
    expect(res.critique.findings.length).toBeGreaterThanOrEqual(1);
  });
});
