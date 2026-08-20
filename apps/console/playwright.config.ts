import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: ["shell.spec.ts", "auth.spec.ts"],
  timeout: 60_000,
  workers: 1,
  use: { baseURL: "http://localhost:3002", channel: "chrome", trace: "on-first-retry" },
  webServer: [
    { command: "node tests/fixture-identity-server.mjs", port: 4100, reuseExistingServer: true },
    { command: "powershell -NoProfile -Command \"$env:IDENTITY_SERVICE_URL='http://127.0.0.1:4100'; pnpm.cmd exec next dev --port 3002\"", port: 3002, reuseExistingServer: true },
  ],
});
