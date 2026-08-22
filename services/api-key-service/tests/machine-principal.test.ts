import { describe, expect, it } from "vitest";
import {
  resolveEffectiveStatus,
  modelAllowed,
  isIpAllowed,
  validateDelegation,
} from "../src/domain/machine-principal.js";
import type { ApiKeyRecord } from "../src/domain/types.js";

function makeRecord(overrides: Partial<ApiKeyRecord> = {}): ApiKeyRecord {
  return {
    id: "key_" + "a".repeat(32),
    organizationId: "org_1",
    workspaceId: "ws_1",
    environmentId: "env_1",
    environment: "production",
    name: "Test Key",
    prefix: "gx_live_key_" + "a".repeat(32),
    secretHash: "hash",
    status: "active",
    permissions: ["responses.create", "models.read"],
    modelRules: [],
    ipAllowlist: [],
    createdBy: "usr_1",
    createdAt: new Date(),
    updatedAt: new Date(),
    expiresAt: null,
    lastUsedAt: null,
    revokedAt: null,
    revokedBy: null,
    ...overrides,
  };
}

describe("Machine Principal Domain Rules", () => {
  describe("Effective Status", () => {
    it("returns active for unexpired, unrevoked key", () => {
      const record = makeRecord();
      expect(resolveEffectiveStatus(record)).toBe("active");
    });

    it("returns revoked if revokedAt or status is revoked", () => {
      expect(resolveEffectiveStatus(makeRecord({ status: "revoked" }))).toBe(
        "revoked",
      );
      expect(
        resolveEffectiveStatus(makeRecord({ revokedAt: new Date() })),
      ).toBe("revoked");
    });

    it("returns disabled if status is disabled", () => {
      expect(resolveEffectiveStatus(makeRecord({ status: "disabled" }))).toBe(
        "disabled",
      );
    });

    it("returns expired if status is expired or expiresAt is past", () => {
      expect(resolveEffectiveStatus(makeRecord({ status: "expired" }))).toBe(
        "expired",
      );
      const past = new Date(Date.now() - 60000);
      expect(resolveEffectiveStatus(makeRecord({ expiresAt: past }))).toBe(
        "expired",
      );
      const future = new Date(Date.now() + 60000);
      expect(resolveEffectiveStatus(makeRecord({ expiresAt: future }))).toBe(
        "active",
      );
    });
  });

  describe("Model Rules (Deny-First Precedence)", () => {
    it("allows all models when rules are empty", () => {
      expect(modelAllowed([], "openai/gpt-4o")).toBe(true);
    });

    it("evaluates explicit deny rules before allow rules", () => {
      const rules = [
        { effect: "allow" as const, pattern: "openai/*" },
        { effect: "deny" as const, pattern: "openai/internal-*" },
      ];
      expect(modelAllowed(rules, "openai/gpt-4o")).toBe(true);
      expect(modelAllowed(rules, "openai/internal-alpha")).toBe(false);
      expect(modelAllowed(rules, "anthropic/claude-3-5-sonnet")).toBe(false);
    });

    it("handles wildcard matching correctly", () => {
      expect(
        modelAllowed(
          [{ effect: "allow" as const, pattern: "*" }],
          "anthropic/claude-3-5-sonnet",
        ),
      ).toBe(true);
      expect(
        modelAllowed(
          [{ effect: "deny" as const, pattern: "*" }],
          "anthropic/claude-3-5-sonnet",
        ),
      ).toBe(false);
    });
  });

  describe("IP Allowlist Matching", () => {
    it("allows all IPs when allowlist is empty", () => {
      expect(isIpAllowed("192.168.1.10", [])).toBe(true);
      expect(isIpAllowed("2001:db8::1", [])).toBe(true);
    });

    it("matches exact IPs", () => {
      expect(isIpAllowed("192.168.1.10", ["192.168.1.10"])).toBe(true);
      expect(isIpAllowed("192.168.1.11", ["192.168.1.10"])).toBe(false);
    });

    it("matches IPv4 CIDR ranges", () => {
      expect(isIpAllowed("10.0.1.5", ["10.0.0.0/16"])).toBe(true);
      expect(isIpAllowed("10.1.1.5", ["10.0.0.0/16"])).toBe(false);
      expect(isIpAllowed("192.168.1.50", ["192.168.1.0/24"])).toBe(true);
      expect(isIpAllowed("192.168.2.50", ["192.168.1.0/24"])).toBe(false);
    });

    it("handles IPv4-mapped IPv6 addresses", () => {
      expect(isIpAllowed("::ffff:192.168.1.10", ["192.168.1.0/24"])).toBe(true);
    });
  });

  describe("Delegation Protection", () => {
    it("allows delegation when creator has all required permissions", () => {
      const creatorPerms = new Set([
        "apiKey.create",
        "model.read",
        "usage.read",
      ]);
      const requestedScopes = [
        "models.read",
        "usage.read",
        "responses.create",
      ] as const;
      const result = validateDelegation(creatorPerms, requestedScopes);
      expect(result.valid).toBe(true);
      expect(result.unauthorizedScopes).toHaveLength(0);
    });

    it("denies delegation when creator attempts privilege escalation", () => {
      const creatorPerms = new Set(["apiKey.create"]);
      const requestedScopes = ["models.read", "usage.read"] as const;
      const result = validateDelegation(creatorPerms, requestedScopes);
      expect(result.valid).toBe(false);
      expect(result.unauthorizedScopes).toContain("models.read");
      expect(result.unauthorizedScopes).toContain("usage.read");
    });
  });
});
