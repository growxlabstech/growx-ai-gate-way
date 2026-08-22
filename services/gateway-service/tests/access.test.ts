import { describe, expect, it } from "vitest";
import {
  authorizeGatewayRequest,
  type AccessDependencies,
} from "../src/access.js";
import type { ApiKeyRecord } from "@growx/api-key-service";
const record: ApiKeyRecord = {
  id: "key_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  organizationId: "org_a",
  workspaceId: "ws_a",
  environmentId: "env_a",
  environment: "production",
  name: "test",
  prefix: "gx_live_key_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  secretHash: "hash",
  status: "active",
  permissions: ["responses.create"],
  modelRules: [],
  ipAllowlist: [],
  createdBy: "usr_a",
  createdAt: new Date(),
  updatedAt: new Date(),
  expiresAt: null,
  lastUsedAt: null,
  revokedAt: null,
  revokedBy: null,
};
const deps: AccessDependencies = {
  async findKey() {
    return record;
  },
  verify(_r, secret) {
    return secret === "s".repeat(24);
  },
  async tenant() {
    return {
      organizationStatus: "active",
      workspaceStatus: "active",
      environmentStatus: "active",
    };
  },
  ipAllowed() {
    return true;
  },
  async rateLimit() {
    return true;
  },
  async concurrencyAvailable() {
    return true;
  },
  async budgetAvailable() {
    return true;
  },
  async securityEvent() {},
};
const header = `Bearer gx_live_${record.id}_${"s".repeat(24)}`;
describe("gateway access", () => {
  it("allows a valid least-privilege key", async () =>
    expect(
      (
        await authorizeGatewayRequest(
          {
            authorization: header,
            clientIp: "203.0.113.1",
            permission: "responses.create",
          },
          deps,
        )
      ).allowed,
    ).toBe(true));
  it("rejects missing credentials", async () =>
    expect(
      await authorizeGatewayRequest(
        { clientIp: "203.0.113.1", permission: "responses.create" },
        deps,
      ),
    ).toMatchObject({ code: "missing_api_key", status: 401 }));
  it("rejects cross-permission use", async () =>
    expect(
      await authorizeGatewayRequest(
        {
          authorization: header,
          clientIp: "203.0.113.1",
          permission: "embeddings.create",
        },
        deps,
      ),
    ).toMatchObject({ code: "permission_denied", status: 403 }));
  it("rejects suspended tenants", async () => {
    const suspended = {
      ...deps,
      async tenant() {
        return {
          organizationStatus: "suspended" as const,
          workspaceStatus: "active" as const,
          environmentStatus: "active" as const,
        };
      },
    };
    expect(
      await authorizeGatewayRequest(
        {
          authorization: header,
          clientIp: "x",
          permission: "responses.create",
        },
        suspended,
      ),
    ).toMatchObject({ code: "organization_suspended" });
  });
});
