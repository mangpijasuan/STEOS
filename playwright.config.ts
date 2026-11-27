import { defineConfig } from "@playwright/test";

// Browser tests (see e2e/). They start the app in development mode against a throwaway PostgreSQL database with the fake
// payment provider, seed it, and drive Chromium at phone, tablet and desktop sizes.
//
//   npm run e2e        needs PostgreSQL 16 with the roles from docs/TESTING.md and an empty database named siamsil_e2e
//
// Set PW_CHROMIUM_PATH to use a Chromium you already have instead of the one `npx playwright install chromium` downloads.

const PORT = 3200;
const BASE_URL = `http://localhost:${PORT}`;
const db = process.env.E2E_DB ?? "siamsil_e2e";

process.env.DATABASE_URL ??= `postgres://siamsil_app:dev_app_pw@localhost:5432/${db}`;
process.env.DATABASE_OWNER_URL ??= `postgres://siamsil_owner:dev_owner_pw@localhost:5432/${db}`;
process.env.APP_DB_ROLE ??= "siamsil_app";

const launchOptions = process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {};

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e/.output",
  globalSetup: "./e2e/global-setup.ts",
  // One shared database and one order counter: run the tests one at a time.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never", outputFolder: "e2e/.report" }]] : [["list"]],
  use: {
    baseURL: BASE_URL,
    launchOptions,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1280, height: 800 } } },
    // Tablet and phone run the layout-sensitive tests; the long ordering flows run on desktop and phone only.
    { name: "tablet", use: { viewport: { width: 820, height: 1180 } }, testIgnore: [/customer-order/, /dine-in/, /roles/] },
    { name: "mobile", use: { viewport: { width: 390, height: 844 }, hasTouch: true }, testIgnore: [/roles/] },
  ],
  webServer: {
    command: `npx next dev -p ${PORT}`,
    url: `${BASE_URL}/api/live`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      ...(process.env as Record<string, string>),
      PORT: String(PORT),
      APP_URL: BASE_URL,
      PAYMENTS_PROVIDER: "fake",
      ORDER_TOKEN_SECRET: "e2e-order-token-secret-0123456789abcdef0123",
      CRON_SECRET: "e2e-cron-secret-0123456789abcdef0123456789",
    },
  },
});
