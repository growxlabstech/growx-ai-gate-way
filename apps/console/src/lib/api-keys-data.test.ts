import { describe, expect, it } from "vitest";
import {
  createWorkspaceApiKey,
  loadWorkspaceApiKeys,
  loadWorkspaceApiKey,
  revokeWorkspaceApiKey,
  rotateWorkspaceApiKey,
  CANONICAL_API_KEY_SCOPES,
  DEFAULT_API_KEY_SCOPES,
} from "./api-keys-data";
import { maskApiKey, publicPrefix } from "./api-key-format";

describe("D5 API Keys Data Layer", () => {
  it("generates correct public prefixes and masks raw secrets", () => {
    const prefix = publicPrefix(
      "production",
      "key_1234567890abcdef1234567890abcdef",
    );
    expect(prefix).toContain("gx_live_key_1234567890abcdef1234567890abcdef");
    expect(prefix).toContain("••••••••••••");

    const masked = maskApiKey("gx_live_key_abcdef0123456789");
    expect(masked).toContain("••••••••••••");
  });

  it("loads tenant-isolated API keys for production workspace", async () => {
    const keys = await loadWorkspaceApiKeys({
      organizationId: "org_northstar",
      workspaceId: "ws_production",
    });

    expect(keys.length).toBeGreaterThanOrEqual(3);
    const activeKey = keys.find((k) => k.id === "key_01jq8a9xprod0001");
    expect(activeKey).toBeDefined();
    expect(activeKey?.name).toBe("Production Backend API");
    expect(activeKey?.status).toBe("active");
    expect(activeKey?.prefix).toContain("gx_live_");
  });

  it("creates a new API key with single-view secret and custom scopes", async () => {
    const result = await createWorkspaceApiKey({
      organizationId: "org_northstar",
      workspaceId: "ws_production",
      input: {
        name: "Telemetry Ingestion Service",
        environment: "production",
        permissions: ["models.read", "responses.create", "batches.create"],
        expiresInDays: 30,
      },
    });

    expect(result.apiKey).toBeDefined();
    expect(result.apiKey.name).toBe("Telemetry Ingestion Service");
    expect(result.apiKey.status).toBe("active");
    expect(result.apiKey.permissions).toEqual([
      "models.read",
      "responses.create",
      "batches.create",
    ]);
    expect(result.apiKey.expiresAt).not.toBeNull();

    // Secret must be generated and match GrowX format
    expect(result.secret).toMatch(/^gx_live_key_[a-f0-9]{32}_[A-Za-z0-9_-]+$/);

    // Created key is queryable
    const queried = await loadWorkspaceApiKey({
      organizationId: "org_northstar",
      workspaceId: "ws_production",
      apiKeyId: result.apiKey.id,
    });
    expect(queried?.id).toBe(result.apiKey.id);
  });

  it("revokes an active API key", async () => {
    const created = await createWorkspaceApiKey({
      organizationId: "org_northstar",
      workspaceId: "ws_production",
      input: {
        name: "Temporary Worker Key",
      },
    });

    expect(created.apiKey.status).toBe("active");

    const revoked = await revokeWorkspaceApiKey({
      organizationId: "org_northstar",
      workspaceId: "ws_production",
      apiKeyId: created.apiKey.id,
    });

    expect(revoked.status).toBe("revoked");
    expect(revoked.revokedAt).not.toBeNull();
  });

  it("rotates an API key, revoking the old key and generating a new secret", async () => {
    const created = await createWorkspaceApiKey({
      organizationId: "org_northstar",
      workspaceId: "ws_production",
      input: {
        name: "Primary App Key",
      },
    });

    const rotated = await rotateWorkspaceApiKey({
      organizationId: "org_northstar",
      workspaceId: "ws_production",
      apiKeyId: created.apiKey.id,
    });

    expect(rotated.oldApiKey.status).toBe("revoked");
    expect(rotated.apiKey.status).toBe("active");
    expect(rotated.apiKey.id).not.toBe(created.apiKey.id);
    expect(rotated.secret).toMatch(/^gx_live_key_[a-f0-9]{32}_[A-Za-z0-9_-]+$/);
  });

  it("provides canonical scopes with secure defaults", () => {
    expect(DEFAULT_API_KEY_SCOPES).toEqual(["models.read", "responses.create"]);
    expect(CANONICAL_API_KEY_SCOPES.length).toBe(8);
  });
});
