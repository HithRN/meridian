import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end configuration. The dev server is started (or reused) automatically.
 * The suite drives the public routes and runs a deterministic research session
 * in a real browser — which is also the no-WebGPU fallback path (§18, §20).
 */
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
