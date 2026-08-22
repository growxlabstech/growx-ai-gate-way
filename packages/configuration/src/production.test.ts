import { describe, expect, it } from "vitest";
import { environmentSchema, assertProductionEnvironment } from "./index.js";
const base = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://db.internal/growx",
  REDIS_URL: "redis://redis.internal",
  SERVICE_AUTH_SECRET: "x".repeat(32),
  BETTER_AUTH_SECRET: "y".repeat(32),
  BETTER_AUTH_URL: "https://auth.example.com",
  PUBLIC_APP_URL: "https://console.example.com",
  CORS_ALLOWED_ORIGINS: "https://console.example.com",
  TRUST_PROXY_TLS: "true",
  OTEL_EXPORTER_OTLP_ENDPOINT: "https://otel.example.com",
  API_KEY_PEPPER: "p".repeat(32),
};
describe("production configuration", () => {
  it("fails closed for open CORS", () => {
    const value = environmentSchema.parse({
      ...base,
      CORS_ALLOWED_ORIGINS: "*",
    });
    expect(() => assertProductionEnvironment(value)).toThrow(
      "explicit HTTPS allowlist",
    );
  });
  it("accepts explicit secure configuration", () => {
    expect(() =>
      assertProductionEnvironment(environmentSchema.parse(base)),
    ).not.toThrow();
  });
});
