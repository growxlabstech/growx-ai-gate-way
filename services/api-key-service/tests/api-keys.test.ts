import { describe, it, expect, beforeEach } from "vitest";
import { ApiKeyService } from "../src/application/api-key-service.js";
import { InMemoryApiKeyRepository } from "../src/infrastructure/database-repository.js";
import { InMemoryLifecycleEvents } from "../src/infrastructure/events.js";

describe("API Key Service Lifecycle and Domain Operations", () => {
  const pepper = "growx-secret-pepper-32-bytes-long-string!!";
  let repository: InMemoryApiKeyRepository;
  let events: InMemoryLifecycleEvents;
  let service: ApiKeyService;

  const orgId = "org_11111111111111111111111111111111";
  const wsId = "ws_22222222222222222222222222222222";
  const envId = "env_33333333333333333333333333333333";
  const userId = "usr_44444444444444444444444444444444";

  beforeEach(() => {
    repository = new InMemoryApiKeyRepository();
    events = new InMemoryLifecycleEvents();
    service = new ApiKeyService(repository, events, {
      pepper,
      maxActiveKeysPerWorkspace: 2,
      defaultExpiryDays: 90,
      maxExpiryDays: 365,
    });
  });

  it("creates an API key with one-time reveal, quota enforcement, and audit event", () => {
    return (async () => {
      const result = await service.create({
        organizationId: orgId,
        workspaceId: wsId,
        environmentId: envId,
        environment: "production",
        name: "Production Gateway Key",
        permissions: ["models.read", "responses.create"],
        modelRules: [{ effect: "deny", pattern: "anthropic/claude-3-haiku" }],
        ipAllowlist: ["192.168.1.0/24"],
        createdBy: userId,
      });

      expect(result.record.id).toMatch(/^key_[a-f0-9]{32}$/);
      expect(result.secret).toMatch(/^gx_live_key_[a-f0-9]{32}_/);
      expect(result.record.secretHash).toBeDefined();
      expect(result.record.status).toBe("active");
      expect(result.record.expiresAt).not.toBeNull();

      expect(events.auditEvents).toHaveLength(1);
      expect(events.auditEvents[0]?.action).toBe("api_key.created");
      expect(events.publishedEvents).toHaveLength(1);
      expect(events.publishedEvents[0]?.eventType).toBe("api_key.created");
    })();
  });

  it("enforces workspace active key quota limits", async () => {
    await service.create({
      organizationId: orgId,
      workspaceId: wsId,
      environmentId: envId,
      environment: "production",
      name: "Key 1",
      createdBy: userId,
    });

    await service.create({
      organizationId: orgId,
      workspaceId: wsId,
      environmentId: envId,
      environment: "production",
      name: "Key 2",
      createdBy: userId,
    });

    await expect(
      service.create({
        organizationId: orgId,
        workspaceId: wsId,
        environmentId: envId,
        environment: "production",
        name: "Key 3 Exceeds",
        createdBy: userId,
      }),
    ).rejects.toThrow("Workspace active API key limit (2) reached");
  });

  it("authenticates valid API key and verifies scopes, IP, and model rules", async () => {
    const { secret, record } = await service.create({
      organizationId: orgId,
      workspaceId: wsId,
      environmentId: envId,
      environment: "production",
      name: "Production Gateway Key",
      permissions: ["models.read", "responses.create"],
      modelRules: [
        { effect: "deny", pattern: "anthropic/claude-3-haiku" },
        { effect: "allow", pattern: "openai/*" },
      ],
      ipAllowlist: ["10.0.0.1", "192.168.1.0/24"],
      createdBy: userId,
    });

    const successDecision = await service.authenticate({
      authorization: `Bearer ${secret}`,
      clientIp: "192.168.1.50",
      permission: "models.read",
      model: "openai/gpt-4o",
    });

    expect(successDecision.allowed).toBe(true);
    if (successDecision.allowed) {
      expect(successDecision.context.apiKeyId).toBe(record.id);
      expect(successDecision.context.organizationId).toBe(orgId);
      expect(successDecision.context.workspaceId).toBe(wsId);
      expect(successDecision.context.actorType).toBe("apiKey");
    }

    const ipDenied = await service.authenticate({
      authorization: `Bearer ${secret}`,
      clientIp: "203.0.113.1",
    });
    expect(ipDenied.allowed).toBe(false);
    if (!ipDenied.allowed) {
      expect(ipDenied.code).toBe("ip_not_allowed");
      expect(ipDenied.status).toBe(403);
    }

    const permDenied = await service.authenticate({
      authorization: `Bearer ${secret}`,
      clientIp: "10.0.0.1",
      permission: "usage.read",
    });
    expect(permDenied.allowed).toBe(false);
    if (!permDenied.allowed) {
      expect(permDenied.code).toBe("permission_denied");
      expect(permDenied.status).toBe(403);
    }

    const modelDenied = await service.authenticate({
      authorization: `Bearer ${secret}`,
      clientIp: "10.0.0.1",
      model: "anthropic/claude-3-haiku",
    });
    expect(modelDenied.allowed).toBe(false);
    if (!modelDenied.allowed) {
      expect(modelDenied.code).toBe("model_not_allowed");
      expect(modelDenied.status).toBe(403);
    }
  });

  it("rotates API key with immediate revocation policy", async () => {
    const { secret: oldSecret, record: oldRecord } = await service.create({
      organizationId: orgId,
      workspaceId: wsId,
      environmentId: envId,
      environment: "production",
      name: "Rotatable Key",
      createdBy: userId,
    });

    const rotation = await service.rotate(orgId, wsId, oldRecord.id, userId, {
      overlapMinutes: 0,
      reason: "Scheduled credential roll",
    });

    expect(rotation.newRecord.id).not.toBe(oldRecord.id);
    expect(rotation.secret).toMatch(/^gx_live_key_[a-f0-9]{32}_/);
    expect(rotation.oldRecord.status).toBe("revoked");

    const oldAuth = await service.authenticate({
      authorization: `Bearer ${oldSecret}`,
      clientIp: "127.0.0.1",
    });
    expect(oldAuth.allowed).toBe(false);
    if (!oldAuth.allowed) {
      expect(oldAuth.code).toBe("revoked_api_key");
    }

    const newAuth = await service.authenticate({
      authorization: `Bearer ${rotation.secret}`,
      clientIp: "127.0.0.1",
    });
    expect(newAuth.allowed).toBe(true);
  });

  it("rotates API key with graceful overlap window", async () => {
    const { secret: oldSecret, record: oldRecord } = await service.create({
      organizationId: orgId,
      workspaceId: wsId,
      environmentId: envId,
      environment: "production",
      name: "Overlap Key",
      createdBy: userId,
    });

    const rotation = await service.rotate(orgId, wsId, oldRecord.id, userId, {
      overlapMinutes: 60,
    });

    expect(rotation.oldRecord.status).toBe("active");
    expect(rotation.oldRecord.expiresAt).not.toBeNull();

    const duringOverlap = await service.authenticate({
      authorization: `Bearer ${oldSecret}`,
      clientIp: "127.0.0.1",
      now: new Date(Date.now() + 30 * 60 * 1000),
    });
    expect(duringOverlap.allowed).toBe(true);

    const afterOverlap = await service.authenticate({
      authorization: `Bearer ${oldSecret}`,
      clientIp: "127.0.0.1",
      now: new Date(Date.now() + 90 * 60 * 1000),
    });
    expect(afterOverlap.allowed).toBe(false);
    if (!afterOverlap.allowed) {
      expect(afterOverlap.code).toBe("expired_api_key");
    }
  });

  it("revokes an API key immediately and blocks further authentication", async () => {
    const { secret, record } = await service.create({
      organizationId: orgId,
      workspaceId: wsId,
      environmentId: envId,
      environment: "production",
      name: "Emergency Revoke Key",
      createdBy: userId,
    });

    const revoked = await service.revoke(orgId, wsId, record.id, userId);
    expect(revoked.status).toBe("revoked");
    expect(revoked.revokedAt).not.toBeNull();
    expect(revoked.revokedBy).toBe(userId);

    const auth = await service.authenticate({
      authorization: `Bearer ${secret}`,
      clientIp: "127.0.0.1",
    });
    expect(auth.allowed).toBe(false);
    if (!auth.allowed) {
      expect(auth.code).toBe("revoked_api_key");
    }
  });

  it("updates individual subresources (permissions, model rules, ip allowlist, limits)", async () => {
    const { record } = await service.create({
      organizationId: orgId,
      workspaceId: wsId,
      environmentId: envId,
      environment: "production",
      name: "Subresource Key",
      createdBy: userId,
    });

    await service.updatePermissions(
      orgId,
      wsId,
      record.id,
      ["models.read", "usage.read"],
      userId,
    );
    await service.updateModelRules(
      orgId,
      wsId,
      record.id,
      [{ effect: "deny", pattern: "deepseek/*" }],
      userId,
    );
    await service.updateIpAllowlist(
      orgId,
      wsId,
      record.id,
      ["10.0.0.0/8"],
      userId,
    );
    await service.updateRateLimits(
      orgId,
      wsId,
      record.id,
      [{ window: "minute", requestLimit: 120 }],
      userId,
    );
    await service.updateSpendingLimit(
      orgId,
      wsId,
      record.id,
      { mode: "hard", monthlyMinor: 500000, currency: "USD", policyVersion: 1 },
      userId,
    );

    const updated = await service.get(orgId, wsId, record.id);
    expect(updated?.permissions).toEqual(["models.read", "usage.read"]);
    expect(updated?.modelRules).toEqual([
      { effect: "deny", pattern: "deepseek/*" },
    ]);
    expect(updated?.ipAllowlist).toEqual(["10.0.0.0/8"]);
    expect(updated?.rateLimits).toEqual([
      { window: "minute", requestLimit: 120 },
    ]);
    expect(updated?.spendingLimit?.monthlyMinor).toBe(500000);
  });

  it("records last used timestamp asynchronously", async () => {
    const { record } = await service.create({
      organizationId: orgId,
      workspaceId: wsId,
      environmentId: envId,
      environment: "production",
      name: "Last Used Key",
      createdBy: userId,
    });

    const now = new Date();
    await service.recordLastUsed(record.id, now);
    const updated = await service.get(orgId, wsId, record.id);
    expect(updated?.lastUsedAt?.getTime()).toBe(now.getTime());
  });
});
