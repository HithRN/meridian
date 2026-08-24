import { describe, it, expect } from "vitest";
import { executeTool, getToolManifest, getTool, PUBLIC_LIMITS } from "@/core/tools";
import type { ToolContext } from "@/core/tools";
import { InMemoryAuditSink } from "@/core/audit/log";
import { validatePatch, runSandboxTests, SandboxError } from "@/core/coding/sandbox";
import { getDataset } from "@/core/data/dataset";
import { profileDataset } from "@/core/data/profile";

function ctx(): ToolContext {
  return { seed: 42, limits: PUBLIC_LIMITS, agentId: "orchestrator", audit: new InMemoryAuditSink() };
}

describe("§18 acceptance — tool schemas", () => {
  it("rejects invalid inputs with INVALID_INPUT", async () => {
    const res = await executeTool("train_model", { datasetId: "synthetic-equity-hourly", modelConfig: { type: "not-a-model" } }, ctx());
    expect(res.ok).toBe(false);
    expect(res.error?.code).toBe("INVALID_INPUT");
  });

  it("rejects unknown parameters (strict schemas)", async () => {
    const res = await executeTool(
      "load_dataset",
      { datasetId: "synthetic-equity-hourly", bogusParam: 1 },
      ctx(),
    );
    expect(res.ok).toBe(false);
    expect(res.error?.code).toBe("INVALID_INPUT");
  });

  it("returns typed output for valid inputs", async () => {
    const res = await executeTool("load_dataset", { datasetId: "synthetic-equity-hourly" }, ctx());
    expect(res.ok).toBe(true);
    expect(res.meta.outputHash).toBeTruthy();
  });

  it("unknown tools return TOOL_NOT_FOUND", async () => {
    const res = await executeTool("does_not_exist", {}, ctx());
    expect(res.ok).toBe(false);
    expect(res.error?.code).toBe("TOOL_NOT_FOUND");
  });

  it("every tool exposes input and output JSON Schemas", () => {
    const manifest = getToolManifest();
    expect(manifest.length).toBeGreaterThanOrEqual(10);
    for (const t of manifest) {
      expect(t.inputSchema).toBeTruthy();
      expect(t.outputSchema).toBeTruthy();
      expect(getTool(t.name)).toBeDefined();
    }
  });
});

describe("§18 acceptance — leakage detection", () => {
  it("flags the known leakage fixture", () => {
    const ds = getDataset("leakage-trap-hourly");
    const profile = profileDataset(ds, true);
    const critical = profile.leakage.filter((l) => l.severity === "critical");
    expect(critical.length).toBeGreaterThanOrEqual(1);
    expect(profile.passed).toBe(false);
  });

  it("does not false-positive on the clean equity dataset", () => {
    const ds = getDataset("synthetic-equity-hourly");
    const profile = profileDataset(ds, false);
    const critical = profile.leakage.filter((l) => l.severity === "critical");
    expect(critical.length).toBe(0);
  });

  it("profile_dataset tool surfaces leakage on the fixture", async () => {
    const res = await executeTool<{ leakage: Array<{ severity: string }> }>(
      "profile_dataset",
      { datasetId: "leakage-trap-hourly" },
      ctx(),
    );
    expect(res.ok).toBe(true);
    expect(res.data!.leakage.some((l) => l.severity === "critical")).toBe(true);
  });
});

describe("§18 acceptance — coding-agent safety", () => {
  it("rejects destructive patches", () => {
    expect(() =>
      validatePatch({ path: "src/strategies/movingAverage.ts", proposedContents: "rm -rf / ; child_process.exec('x')" }),
    ).toThrow(SandboxError);
  });

  it("rejects patches outside the whitelist", () => {
    expect(() =>
      validatePatch({ path: "/etc/passwd", proposedContents: "x" }),
    ).toThrow(SandboxError);
  });

  it("run_tests fails on the unpatched repo and passes with the fix", () => {
    const before = runSandboxTests();
    expect(before.allPassed).toBe(false);
    const fixed = runSandboxTests({
      path: "src/strategies/movingAverage.ts",
      proposedContents:
        "const s = 1;\nif (Number.isNaN(s)) return 0;\nreturn f > s ? 1 : -1;",
    });
    expect(fixed.allPassed).toBe(true);
  });
});
