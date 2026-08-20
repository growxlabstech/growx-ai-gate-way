import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
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
