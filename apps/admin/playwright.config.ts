import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  use: {
    baseURL: "http://localhost:3001",
    channel: "chrome",
    trace: "on-first-retry",
  },
  webServer: {
    command: "pnpm dev",
    port: 3001,
    reuseExistingServer: true,
  },
});
