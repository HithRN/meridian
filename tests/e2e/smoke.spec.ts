import { test, expect } from "@playwright/test";

test.describe("public routes", () => {
  test("overview renders", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("MEV economy");
    await expect(page.getByRole("link", { name: /Ask the AI copilot/i })).toBeVisible();
  });

  test("jito lab recommends a tip and shows validation", async ({ page }) => {
    await page.goto("/jito");
    await expect(page.getByText("Recommended tip")).toBeVisible();
    await expect(page.getByText(/Walk-forward validation/)).toBeVisible();
  });

  test("explainable AI predicts and explains a bundle", async ({ page }) => {
    await page.goto("/ai");
    await expect(page.getByText("Why — exact Shapley values")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText("What would change the outcome?")).toBeVisible();
  });

  test("copilot answers with tool evidence", async ({ request }) => {
    const res = await request.post("/api/copilot", {
      data: { engine: "deterministic", messages: [{ role: "user", content: "What tip outbids p95?" }] },
    });
    const body = await res.json();
    expect(body.toolCalls[0].name).toBe("recommend_bundle_tip");
    expect(body.reply).toContain("lamports");
  });

  test("tools page lists MCP-compatible tools", async ({ page }) => {
    await page.goto("/tools");
    await expect(page.getByText("Tool catalog")).toBeVisible();
    await expect(page.getByText("backtest").first()).toBeVisible();
  });

  test("health endpoint responds", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.tools).toBeGreaterThanOrEqual(10);
  });

  test("tool discovery endpoint returns schemas", async ({ request }) => {
    const res = await request.get("/api/tools");
    const body = await res.json();
    expect(body.tools.length).toBeGreaterThanOrEqual(10);
    expect(body.tools[0].inputSchema).toBeTruthy();
  });
});

test.describe("deterministic research (no-WebGPU fallback path)", () => {
  test("runs a full session to a report", async ({ page }) => {
    await page.goto("/research");
    // Deterministic is the default reasoner — this is the always-on fallback.
    await page.getByRole("button", { name: /Run research/i }).click();

    // The workflow reaches REPORT_READY and results render.
    await expect(page.getByText("Model comparison")).toBeVisible({ timeout: 60_000 });
    await page.getByRole("tab", { name: "Evidence report" }).click();
    // The export controls live on the report tab.
    await expect(page.getByRole("button", { name: /Export Markdown/i })).toBeVisible();
  });
});
