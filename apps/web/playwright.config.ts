import { defineConfig, devices } from "@playwright/test";

const WEB_PORT = 5173;
const API_PORT = 3000;

/**
 * E2E servers (started automatically, no Docker required):
 * 1. Fastify API with NODE_ENV=test → in-memory PGlite + seeded data on port 3000.
 * 2. Vite dev server on 5173, which proxies /api, /devices, /sync, /purchases
 *    and /sms-log to the API.
 *
 * All tests share ONE server instance (workers: 1, no retries), so assertions
 * tolerate accumulated state: payment-run totals are compared against the UI
 * total rather than hardcoded sums, and every `playwright test` invocation
 * boots a fresh database.
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.e2e.ts",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? "line" : "list",
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: "pnpm exec tsx src/index.ts",
      cwd: "../api",
      env: {
        ...process.env,
        NODE_ENV: "test",
        PORT: String(API_PORT),
        WEB_ORIGIN: `http://localhost:${WEB_PORT}`,
      },
      url: `http://localhost:${API_PORT}/health`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `pnpm exec vite --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
