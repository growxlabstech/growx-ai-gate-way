import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createServer, request as httpRequest, type Server } from "node:http";
import { ApiKeyService } from "../src/application/api-key-service.js";
import { InMemoryApiKeyRepository } from "../src/infrastructure/database-repository.js";
import { InMemoryLifecycleEvents } from "../src/infrastructure/events.js";
import { createHttpHandler } from "../src/transport/http-routes.js";
import { InMemoryManagementAuthResolver } from "../src/transport/management-auth.js";
import { createApiKeyApplication } from "../src/index.js";

describe("Phase 3 Management Plane Security Hardening", () => {
  const pepper = "growx-secret-pepper-32-bytes-long-string!!";
  let server: Server;
  let baseUrl: string;
  let service: ApiKeyService;
  let repository: InMemoryApiKeyRepository;
  let events: InMemoryLifecycleEvents;
  let authResolver: InMemoryManagementAuthResolver;

  const orgId = "org_11111111111111111111111111111111";
  const org2Id = "org_22222222222222222222222222222222";
  const ws1Id = "ws_11111111111111111111111111111111";
  const ws2Id = "ws_22222222222222222222222222222222";

  const ownerUserId = "usr_owner_111111111111111111111";
  const devUserId = "usr_dev_11111111111111111111111";
  const viewerUserId = "usr_viewer_1111111111111111111";
  const suspendedUserId = "usr_susp_11111111111111111111";

  const ownerToken = "sess_tok_owner_valid_123456789012345";
  const devToken = "sess_tok_dev_valid_12345678901234567";
  const viewerToken = "sess_tok_viewer_valid_12345678901234";
  const revokedToken = "sess_tok_revoked_123456789012345678";
  const expiredToken = "sess_tok_expired_123456789012345678";
  const suspendedUserToken = "sess_tok_susp_user_1234567890123456";

  beforeEach(async () => {
    repository = new InMemoryApiKeyRepository();
    events = new InMemoryLifecycleEvents();
    authResolver = new InMemoryManagementAuthResolver();

    // Register Organizations
    authResolver.registerOrganization({
      id: orgId,
      status: "active",
      ownerUserId,
    });
    authResolver.registerOrganization({
      id: org2Id,
      status: "active",
      ownerUserId,
    });

    // Register Workspaces
    authResolver.registerWorkspace({
      id: ws1Id,
      organizationId: orgId,
      status: "active",
    });
    authResolver.registerWorkspace({
      id: ws2Id,
      organizationId: orgId,
      status: "active",
    });

    // Register Sessions & Users
    authResolver.registerSession({
      sessionId: "ses_owner",
      userId: ownerUserId,
      token: ownerToken,
      expiresAt: new Date(Date.now() + 86400000),
      revokedAt: null,
      userStatus: "active",
    });
    authResolver.registerSession({
      sessionId: "ses_dev",
      userId: devUserId,
      token: devToken,
      expiresAt: new Date(Date.now() + 86400000),
      revokedAt: null,
      userStatus: "active",
    });
    authResolver.registerSession({
      sessionId: "ses_viewer",
      userId: viewerUserId,
      token: viewerToken,
      expiresAt: new Date(Date.now() + 86400000),
      revokedAt: null,
      userStatus: "active",
    });
    authResolver.registerSession({
      sessionId: "ses_revoked",
      userId: devUserId,
      token: revokedToken,
      expiresAt: new Date(Date.now() + 86400000),
      revokedAt: new Date(),
      userStatus: "active",
    });
    authResolver.registerSession({
      sessionId: "ses_expired",
      userId: devUserId,
      token: expiredToken,
      expiresAt: new Date(Date.now() - 10000),
      revokedAt: null,
      userStatus: "active",
    });
    authResolver.registerSession({
      sessionId: "ses_suspended_user",
      userId: suspendedUserId,
      token: suspendedUserToken,
      expiresAt: new Date(Date.now() + 86400000),
      revokedAt: null,
      userStatus: "suspended",
    });

    // Register Memberships
    // Developer is member of orgId, but ONLY in ws1Id
    authResolver.registerMembership({
      userId: devUserId,
      organizationId: orgId,
      workspaceIds: [ws1Id],
      roles: ["developer"],
      status: "active",
    });

    // Viewer is member of orgId, ws1Id
    authResolver.registerMembership({
      userId: viewerUserId,
      organizationId: orgId,
      workspaceIds: [ws1Id],
      roles: ["viewer"],
      status: "active",
    });

    service = new ApiKeyService(repository, events, {
      pepper,
      maxActiveKeysPerWorkspace: 10,
    });

    const handler = createHttpHandler(service, "api-key-service", authResolver);
    server = createServer(handler);
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const addr = server.address() as { port: number };
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  interface ApiResponse {
    status: number;
    headers: Record<string, string | string[] | undefined>;
    body: {
      status?: string | undefined;
      error?:
        | { code: string; message: string; requestId?: string | undefined }
        | undefined;
      apiKey?:
        | {
            id: string;
            name: string;
            prefix: string;
            maskedKey: string;
            status: string;
          }
        | undefined;
      oldApiKey?: { status: string } | undefined;
      secret?: string | undefined;
      data?: { id?: string; name?: string; [key: string]: unknown } | undefined;
      success?: boolean;
    };
  }

  async function apiCall(
    method: string,
    path: string,
    body?: Record<string, unknown> | undefined,
    headers: Record<string, string> = {},
  ): Promise<ApiResponse> {
    return new Promise((resolve, reject) => {
      const url = new URL(path, baseUrl);
      const req = httpRequest(
        url,
        {
          method,
          headers: {
            "content-type": "application/json",
            ...headers,
          },
        },
        (res) => {
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => {
            try {
              resolve({
                status: res.statusCode ?? 500,
                headers: res.headers,
                body: data ? JSON.parse(data) : {},
              });
            } catch {
              resolve({
                status: res.statusCode ?? 500,
                headers: res.headers,
                body: {},
              });
            }
          });
        },
      );
      req.on("error", reject);
      if (body) {
        req.write(JSON.stringify(body));
      }
      req.end();
    });
  }

  // 1. Unauthenticated human -> cannot create key
  it("unauthenticated human cannot create API key (401)", async () => {
    const res = await apiCall(
      "POST",
      `/v1/organizations/${orgId}/workspaces/${ws1Id}/api-keys`,
      {
        name: "Unauthenticated Key",
      },
    );
    expect(res.status).toBe(401);
    expect(res.body.error?.code).toBe("UNAUTHENTICATED");
  });

  // 2. Unauthenticated human -> cannot list keys
  it("unauthenticated human cannot list API keys (401)", async () => {
    const res = await apiCall(
      "GET",
      `/v1/organizations/${orgId}/workspaces/${ws1Id}/api-keys`,
    );
    expect(res.status).toBe(401);
    expect(res.body.error?.code).toBe("UNAUTHENTICATED");
  });

  // 3. Forged x-actor-id -> no access (identity headers ignored)
  it("forged x-actor-id header without valid session yields 401 UNAUTHENTICATED", async () => {
    const res = await apiCall(
      "POST",
      `/v1/organizations/${orgId}/workspaces/${ws1Id}/api-keys`,
      { name: "Forged Header Key" },
      { "x-actor-id": ownerUserId },
    );
    expect(res.status).toBe(401);
    expect(res.body.error?.code).toBe("UNAUTHENTICATED");
  });

  // 4. Forged tenant headers -> no access
  it("forged tenant headers do not bypass workspace boundary", async () => {
    const res = await apiCall(
      "POST",
      `/v1/organizations/${orgId}/workspaces/${ws2Id}/api-keys`,
      { name: "Forged Workspace Key" },
      {
        authorization: `Bearer ${devToken}`,
        "x-workspace-id": ws1Id,
        "x-organization-id": orgId,
      },
    );
    expect(res.status).toBe(403);
    expect(res.body.error?.code).toBe("FORBIDDEN");
  });

  // 5. Authenticated user without capability -> 403 (Viewer role cannot create key)
  it("authenticated viewer role without apiKey.create capability returns 403", async () => {
    const res = await apiCall(
      "POST",
      `/v1/organizations/${orgId}/workspaces/${ws1Id}/api-keys`,
      { name: "Viewer Creation Attempt" },
      { authorization: `Bearer ${viewerToken}` },
    );
    expect(res.status).toBe(403);
    expect(res.body.error?.code).toBe("FORBIDDEN");
  });

  // 6. Authenticated user in Workspace 1 -> cannot manage Workspace 2 keys
  it("authenticated developer in Workspace 1 cannot create key in Workspace 2 (403)", async () => {
    const res = await apiCall(
      "POST",
      `/v1/organizations/${orgId}/workspaces/${ws2Id}/api-keys`,
      { name: "Cross-Workspace Attempt" },
      { authorization: `Bearer ${devToken}` },
    );
    expect(res.status).toBe(403);
    expect(res.body.error?.code).toBe("FORBIDDEN");
  });

  // 7. Authorized Workspace 1 user -> can create and manage Workspace 1 keys
  it("authorized developer in Workspace 1 can create, get, rotate, update, and revoke keys", async () => {
    // CREATE
    const createRes = await apiCall(
      "POST",
      `/v1/organizations/${orgId}/workspaces/${ws1Id}/api-keys`,
      {
        name: "Dev Key 1",
        permissions: ["models.read", "responses.create"],
      },
      { authorization: `Bearer ${devToken}` },
    );
    expect(createRes.status).toBe(201);
    expect(createRes.body.apiKey?.name).toBe("Dev Key 1");
    expect(createRes.body.secret).toBeDefined();
    const keyId = createRes.body.apiKey!.id;

    // GET
    const getRes = await apiCall(
      "GET",
      `/v1/organizations/${orgId}/workspaces/${ws1Id}/api-keys/${keyId}`,
      undefined,
      { authorization: `Bearer ${devToken}` },
    );
    expect(getRes.status).toBe(200);
    expect(getRes.body.data?.id).toBe(keyId);

    // PATCH
    const patchRes = await apiCall(
      "PATCH",
      `/v1/organizations/${orgId}/workspaces/${ws1Id}/api-keys/${keyId}`,
      { name: "Renamed Dev Key" },
      { authorization: `Bearer ${devToken}` },
    );
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.data?.name).toBe("Renamed Dev Key");

    // SUBRESOURCES UPDATE
    const modelRuleRes = await apiCall(
      "PUT",
      `/v1/organizations/${orgId}/workspaces/${ws1Id}/api-keys/${keyId}/models`,
      { modelRules: [{ effect: "allow", pattern: "gpt-4o" }] },
      { authorization: `Bearer ${devToken}` },
    );
    expect(modelRuleRes.status).toBe(200);
    expect(modelRuleRes.body.success).toBe(true);

    // ROTATE
    const rotateRes = await apiCall(
      "POST",
      `/v1/organizations/${orgId}/workspaces/${ws1Id}/api-keys/${keyId}/rotate`,
      { overlapMinutes: 10, reason: "Scheduled rotation" },
      { authorization: `Bearer ${devToken}` },
    );
    expect(rotateRes.status).toBe(200);
    expect(rotateRes.body.apiKey?.id).not.toBe(keyId);
    expect(rotateRes.body.secret).toBeDefined();

    // REVOKE
    const revokeRes = await apiCall(
      "DELETE",
      `/v1/organizations/${orgId}/workspaces/${ws1Id}/api-keys/${keyId}`,
      undefined,
      { authorization: `Bearer ${devToken}` },
    );
    expect(revokeRes.status).toBe(200);
    expect(revokeRes.body.success).toBe(true);

    // Verify Audit Event recorded canonical developer user ID, NOT 'system'
    const auditCreated = events.auditEvents.find(
      (e) => e.action === "api_key.created",
    );
    expect(auditCreated).toBeDefined();
    expect(auditCreated?.actorId).toBe(devUserId);
  });

  // 8. Revoked human session -> management request denied
  it("revoked human session token is rejected with 401 UNAUTHENTICATED", async () => {
    const res = await apiCall(
      "POST",
      `/v1/organizations/${orgId}/workspaces/${ws1Id}/api-keys`,
      { name: "Revoked Session Key" },
      { authorization: `Bearer ${revokedToken}` },
    );
    expect(res.status).toBe(401);
    expect(res.body.error?.code).toBe("UNAUTHENTICATED");
  });

  // 8b. Expired human session -> management request denied
  it("expired human session token is rejected with 401 UNAUTHENTICATED", async () => {
    const res = await apiCall(
      "POST",
      `/v1/organizations/${orgId}/workspaces/${ws1Id}/api-keys`,
      { name: "Expired Session Key" },
      { authorization: `Bearer ${expiredToken}` },
    );
    expect(res.status).toBe(401);
    expect(res.body.error?.code).toBe("UNAUTHENTICATED");
  });

  // 8c. Suspended user -> management request denied
  it("suspended user session is rejected with 403 USER_SUSPENDED", async () => {
    const res = await apiCall(
      "POST",
      `/v1/organizations/${orgId}/workspaces/${ws1Id}/api-keys`,
      { name: "Suspended User Key" },
      { authorization: `Bearer ${suspendedUserToken}` },
    );
    expect(res.status).toBe(403);
    expect(res.body.error?.code).toBe("USER_SUSPENDED");
  });

  // 9. Suspended organization / workspace -> management denied
  it("suspended organization denies management operations (403)", async () => {
    authResolver.registerOrganization({
      id: "org_suspended",
      status: "suspended",
      ownerUserId,
    });
    authResolver.registerWorkspace({
      id: "ws_in_suspended_org",
      organizationId: "org_suspended",
      status: "active",
    });

    const res = await apiCall(
      "POST",
      "/v1/organizations/org_suspended/workspaces/ws_in_suspended_org/api-keys",
      { name: "Key in Suspended Org" },
      { authorization: `Bearer ${ownerToken}` },
    );
    expect(res.status).toBe(403);
    expect(res.body.error?.code).toBe("ORGANIZATION_SUSPENDED");
  });

  it("suspended workspace denies management operations (403)", async () => {
    authResolver.registerWorkspace({
      id: "ws_suspended",
      organizationId: orgId,
      status: "suspended",
    });

    const res = await apiCall(
      "POST",
      `/v1/organizations/${orgId}/workspaces/ws_suspended/api-keys`,
      { name: "Key in Suspended Ws" },
      { authorization: `Bearer ${ownerToken}` },
    );
    expect(res.status).toBe(403);
    expect(res.body.error?.code).toBe("WORKSPACE_SUSPENDED");
  });

  // 10. API key itself -> cannot call human management endpoints
  it("API key cannot be used to access human management plane (401 INVALID_PRINCIPAL)", async () => {
    const res = await apiCall(
      "POST",
      `/v1/organizations/${orgId}/workspaces/${ws1Id}/api-keys`,
      { name: "Nested Key" },
      {
        authorization:
          "Bearer gx_live_key_0123456789abcdef0123456789abcdef_secretpart123456789",
      },
    );
    expect(res.status).toBe(401);
    expect(res.body.error?.code).toBe("INVALID_PRINCIPAL");
  });

  // 11. Internal service credential without human session -> cannot masquerade
  it("internal service without valid human session cannot access management endpoints", async () => {
    const res = await apiCall(
      "GET",
      `/v1/organizations/${orgId}/workspaces/${ws1Id}/api-keys`,
      undefined,
      {
        "x-service-name": "internal-sync-worker",
        "x-service-auth": "secret-internal-signature",
      },
    );
    expect(res.status).toBe(401);
    expect(res.body.error?.code).toBe("UNAUTHENTICATED");
  });

  // 12. Query param credential location -> 400
  it("rejects token transmitted in query parameters with 400 INVALID_CREDENTIAL_LOCATION", async () => {
    const res = await apiCall(
      "GET",
      `/v1/organizations/${orgId}/workspaces/${ws1Id}/api-keys?token=${devToken}`,
    );
    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe("INVALID_CREDENTIAL_LOCATION");
  });

  // 13. Production bootstrap without DATABASE_URL -> fails
  it("production bootstrap without DATABASE_URL fails closed", () => {
    const prevEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = "production";
      expect(() => {
        createApiKeyApplication({
          pepper: "production_secret_pepper_with_at_least_32_bytes!!",
        });
      }).toThrow(
        /(Production API Key Service requires a valid database connection|Production configuration failure)/,
      );
    } finally {
      process.env.NODE_ENV = prevEnv;
    }
  });

  // 14. Production bootstrap without API_KEY_PEPPER -> fails
  it("production bootstrap without API_KEY_PEPPER fails closed", () => {
    const prevEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = "production";
      expect(() => {
        createApiKeyApplication({
          pepper: "",
        });
      }).toThrow(/API_KEY_PEPPER is mandatory/);
    } finally {
      process.env.NODE_ENV = prevEnv;
    }
  });

  // 15. Production bootstrap with invalid pepper (<32 bytes) -> fails
  it("production bootstrap with short API_KEY_PEPPER fails closed", () => {
    const prevEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = "production";
      expect(() => {
        createApiKeyApplication({
          pepper: "short_pepper",
        });
      }).toThrow(
        /API_KEY_PEPPER is mandatory and must contain at least 32 bytes/,
      );
    } finally {
      process.env.NODE_ENV = prevEnv;
    }
  });
});
