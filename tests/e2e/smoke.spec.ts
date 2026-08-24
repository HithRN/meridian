import { test, expect } from "@playwright/test";

test.describe("public routes", () => {
  test("overview renders", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Auditable research");
    await expect(page.getByRole("link", { name: /Start a research run/i })).toBeVisible();
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
    await expect(page.getByText("Evidence report")).toBeVisible();
    // A model row and the export controls exist.
    await expect(page.getByRole("button", { name: /Export Markdown/i })).toBeVisible();
  });
});
