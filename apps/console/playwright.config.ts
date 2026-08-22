import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: [
    "shell.spec.ts",
    "auth.spec.ts",
    "overview.spec.ts",
    "api-keys.spec.ts",
    "models.spec.ts",
    "playground.spec.ts",
    "analytics.spec.ts",
    "billing.spec.ts",
    "settings.spec.ts",
  ],
  timeout: 90_000,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:3102",
    channel: "chrome",
    trace: "on-first-retry",
  },
  webServer: [
    {
      command: "node tests/fixture-identity-server.mjs",
      url: "http://127.0.0.1:4100/health",
      reuseExistingServer: false,
    },
    {
      command: "pnpm exec next start --hostname 127.0.0.1 --port 3102",
      url: "http://127.0.0.1:3102/health",
      reuseExistingServer: false,
      env: {
        ...process.env,
        IDENTITY_SERVICE_URL: "http://127.0.0.1:4100",
        D2_FIXTURE_IDENTITY: "0",
      },
    },
  ],
});
