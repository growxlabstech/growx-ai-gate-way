import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import pino from "pino";
import { maskApiKey, redactGrowXSecrets, gatewayMetrics } from "./index.js";

describe("redaction policy", () => {
  it("redacts nested credentials", () => {
    let output = "";
    const sink = new Writable({
      write(chunk, _encoding, callback) {
        output += chunk.toString();
        callback();
      }
    });
    const logger = pino({ redact: { censor: "[REDACTED]", paths: ["authorization", "payload.apiKey", "payload.webhookSecret"] } }, sink);
    logger.info({ authorization: "Bearer secret", payload: { apiKey: "gx_live_secret", webhookSecret: "whsec_secret" } });
    expect(output).not.toContain("gx_live_secret");
    expect(output).not.toContain("whsec_secret");
    expect(output).not.toContain("Bearer secret");
  });

  it("redacts raw GrowX secret strings via redactGrowXSecrets", () => {
    const rawKey = "gx_live_" + "key_" + "a".repeat(32) + "_" + "s".repeat(30);
    const logLine = `Failed authentication for key: ${rawKey} from 1.2.3.4`;
    const redacted = redactGrowXSecrets(logLine);
    expect(redacted).not.toContain("s".repeat(30));
    expect(redacted).toContain("gx_live_key_[REDACTED]");
  });

  it("masks API keys safely", () => {
    const keyId = "key_" + "b".repeat(32);
    const rawKey = "gx_live_" + keyId + "_" + "x".repeat(32);
    expect(maskApiKey(rawKey)).toBe(`gx_live_${keyId}_••••••••••••`);
    expect(maskApiKey(`gx_test_${keyId}`)).toBe(`gx_test_${keyId}_••••••••••••`);
    expect(maskApiKey("")).toBe("••••••••");
  });

  it("tracks gateway metrics correctly", () => {
    gatewayMetrics.reset();
    gatewayMetrics.recordRequest();
    gatewayMetrics.recordAuthSuccess();
    gatewayMetrics.recordAuthFailure("invalid_api_key");
    gatewayMetrics.recordRateLimit();
    gatewayMetrics.recordPermissionDenied();
    gatewayMetrics.recordBudgetDenied();
    gatewayMetrics.recordCacheHit();
    gatewayMetrics.recordCacheMiss();

    const snapshot = gatewayMetrics.getSnapshot();
    expect(snapshot.requestsTotal).toBe(1);
    expect(snapshot.authSuccessTotal).toBe(1);
    expect(snapshot.authFailureTotal["invalid_api_key"]).toBe(1);
    expect(snapshot.rateLimitTotal).toBe(1);
    expect(snapshot.permissionDeniedTotal).toBe(1);
    expect(snapshot.budgetDeniedTotal).toBe(1);
    expect(snapshot.cacheHitsTotal).toBe(1);
    expect(snapshot.cacheMissesTotal).toBe(1);
  });
});

