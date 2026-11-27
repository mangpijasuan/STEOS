import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { TEST_APP_ROLE, TEST_APP_URL, TEST_OWNER_URL } from "./tests/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    // Only the unit and integration tests. The browser tests in e2e/ are run by Playwright (npm run e2e).
    include: ["tests/**/*.test.ts"],
    globalSetup: ["./tests/global-setup.ts"],
    fileParallelism: false,
    hookTimeout: 30000,
    env: {
      TRUSTED_CLIENT_IP_HEADER: "x-forwarded-for",
      DATABASE_URL: TEST_APP_URL,
      DATABASE_OWNER_URL: TEST_OWNER_URL,
      APP_DB_ROLE: TEST_APP_ROLE,
      APP_URL: "http://localhost:3000",
      PAYMENTS_PROVIDER: "fake",
      ORDER_TOKEN_SECRET: "test-secret",
      CRON_SECRET: "test-cron-secret",
    },
  },
});
