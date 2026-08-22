import { describe, expect, it, beforeEach } from "vitest";
import {
  ApiKeyService,
  InMemoryApiKeyRepository,
  InMemoryLifecycleEvents,
  hasApiKeyInQuery,
} from "../src/api-keys.js";

const PEPPER = "p".repeat(32);

describe("Security & Abuse Protections", () => {
  let repository: InMemoryApiKeyRepository;
  let events: InMemoryLifecycleEvents;
  let service: ApiKeyService;

  beforeEach(() => {
    repository = new InMemoryApiKeyRepository();
    events = new InMemoryLifecycleEvents();
    service = new ApiKeyService(repository, events, PEPPER);
  });

  it("detects and rejects API keys passed via query parameters", () => {
    expect(hasApiKeyInQuery("/v1/models?api_key=secret")).toBe(true);
    expect(hasApiKeyInQuery("/v1/models?apiKey=secret")).toBe(true);
    expect(hasApiKeyInQuery("/v1/models?key=secret")).toBe(true);
    expect(hasApiKeyInQuery("/v1/models?access_token=secret")).toBe(true);
    expect(hasApiKeyInQuery("/v1/models")).toBe(false);
    expect(hasApiKeyInQuery("/v1/models?limit=10")).toBe(false);
  });

  it("emits security event on invalid secret", async () => {
    const key = await service.create({
      organizationId: "org_1",
      workspaceId: "ws_1",
      environmentId: "env_1",
      environment: "production",
      name: "Sec Key",
      createdBy: "usr_1",
    });

    const tamperedSecret = key.secret.slice(0, -5) + "wrong";
    const decision = await service.authenticate(tamperedSecret);

    expect(decision.allowed).toBe(false);
    expect(events.securityEvents).toHaveLength(1);
    expect(events.securityEvents[0]?.eventType).toBe(
      "gateway.authentication.failed",
    );
    expect(events.securityEvents[0]?.details["reason"]).toBe("invalid_secret");
  });

  it("emits security event on unknown key ID", async () => {
    const fakeKey = "gx_live_key_" + "0".repeat(32) + "_" + "s".repeat(32);
    const decision = await service.authenticate(fakeKey);

    expect(decision.allowed).toBe(false);
    expect(events.securityEvents).toHaveLength(1);
    expect(events.securityEvents[0]?.details["reason"]).toBe("unknown_key_id");
  });

  it("emits security event on revoked key use", async () => {
    const key = await service.create({
      organizationId: "org_1",
      workspaceId: "ws_1",
      environmentId: "env_1",
      environment: "production",
      name: "Revoke Abuse",
      createdBy: "usr_1",
    });

    await service.revoke("org_1", "ws_1", key.record.id, "usr_1");
    const decision = await service.authenticate(key.secret);

    expect(decision.allowed).toBe(false);
    const revokedEvents = events.securityEvents.filter(
      (e) => e.details["reason"] === "revoked_api_key",
    );
    expect(revokedEvents).toHaveLength(1);
  });

  it("emits security event on expired key use", async () => {
    const key = await service.create({
      organizationId: "org_1",
      workspaceId: "ws_1",
      environmentId: "env_1",
      environment: "production",
      name: "Expired Abuse",
      createdBy: "usr_1",
      expiresAt: new Date(Date.now() - 10000), // in the past
    });

    const decision = await service.authenticate(key.secret);
    expect(decision.allowed).toBe(false);
    const expiredEvents = events.securityEvents.filter(
      (e) => e.details["reason"] === "expired_api_key",
    );
    expect(expiredEvents).toHaveLength(1);
  });

  it("handles concurrent authentication attempts safely", async () => {
    const key = await service.create({
      organizationId: "org_1",
      workspaceId: "ws_1",
      environmentId: "env_1",
      environment: "production",
      name: "Concurrent Key",
      createdBy: "usr_1",
    });

    const attempts = Array.from({ length: 50 }, () =>
      service.authenticate(key.secret),
    );
    const results = await Promise.all(attempts);

    for (const result of results) {
      expect(result.allowed).toBe(true);
    }
  });
});
