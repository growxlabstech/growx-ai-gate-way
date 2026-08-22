import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createServer, request as httpRequest, type Server } from "node:http";
import { ApiKeyService } from "../src/application/api-key-service.js";
import { InMemoryApiKeyRepository } from "../src/infrastructure/database-repository.js";
import { InMemoryLifecycleEvents } from "../src/infrastructure/events.js";
import { createHttpHandler } from "../src/transport/http-routes.js";
import { InMemoryManagementAuthResolver } from "../src/transport/management-auth.js";

describe("API Key Service HTTP Transport Routes", () => {
  const pepper = "growx-secret-pepper-32-bytes-long-string!!";
  let server: Server;
  let baseUrl: string;
  let service: ApiKeyService;
  let authResolver: InMemoryManagementAuthResolver;

  const orgId = "org_11111111111111111111111111111111";
  const wsId = "ws_22222222222222222222222222222222";
  const adminUserId = "usr_test_admin_123456789012345";
  const sessionToken = "sess_tok_admin_valid_12345678901234";

  beforeEach(async () => {
    const repository = new InMemoryApiKeyRepository();
    const events = new InMemoryLifecycleEvents();
    authResolver = new InMemoryManagementAuthResolver();

    authResolver.registerOrganization({
      id: orgId,
      status: "active",
      ownerUserId: adminUserId,
    });

    authResolver.registerWorkspace({
      id: wsId,
      organizationId: orgId,
      status: "active",
    });

    authResolver.registerSession({
      sessionId: "ses_admin_1",
      userId: adminUserId,
      token: sessionToken,
      expiresAt: new Date(Date.now() + 86400000),
      revokedAt: null,
      userStatus: "active",
    });

    authResolver.registerMembership({
      userId: adminUserId,
      organizationId: orgId,
      workspaceIds: [wsId],
      roles: ["organization_owner"],
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
      data?:
        | (Array<{
            id: string;
            name: string;
            secret?: string | undefined;
            secretHash?: string | undefined;
          }> & {
            id?: string | undefined;
            name?: string | undefined;
            status?: string | undefined;
          })
        | undefined;
      principal?: { actorType: string } | undefined;
      pagination?: { cursor: string | null; hasMore: boolean } | undefined;
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
            authorization: `Bearer ${sessionToken}`,
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

  it("handles health check routes", async () => {
    const res = await apiCall("GET", "/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });

  it("creates an API key with one-time secret and Cache-Control: no-store", async () => {
    const res = await apiCall(
      "POST",
      `/v1/organizations/${orgId}/workspaces/${wsId}/api-keys`,
      {
        name: "Test API Key",
        environment: "production",
        permissions: ["models.read", "responses.create"],
      },
    );

    expect(res.status).toBe(201);
    expect(res.headers["cache-control"]).toContain("no-store");
    expect(res.body.apiKey!.name).toBe("Test API Key");
    expect(res.body.apiKey!.prefix).toMatch(/^gx_live_key_/);
    expect(res.body.apiKey!.maskedKey).toContain("••••••••••••");
    expect(res.body.secret).toMatch(/^gx_live_key_[a-f0-9]{32}_/);
  });

  it("lists API keys returning safe metadata without secrets", async () => {
    await apiCall(
      "POST",
      `/v1/organizations/${orgId}/workspaces/${wsId}/api-keys`,
      {
        name: "Key 1",
      },
    );
    await apiCall(
      "POST",
      `/v1/organizations/${orgId}/workspaces/${wsId}/api-keys`,
      {
        name: "Key 2",
      },
    );

    const res = await apiCall(
      "GET",
      `/v1/organizations/${orgId}/workspaces/${wsId}/api-keys`,
    );
    expect(res.status).toBe(200);
    const items = res.body.data as unknown as Array<{
      id: string;
      name: string;
      secret?: string;
      secretHash?: string;
    }>;
    expect(items).toHaveLength(2);
    expect(items[0]?.secret).toBeUndefined();
    expect(items[0]?.secretHash).toBeUndefined();
  });

  it("gets, patches, and deletes (revokes) API key", async () => {
    const createRes = await apiCall(
      "POST",
      `/v1/organizations/${orgId}/workspaces/${wsId}/api-keys`,
      {
        name: "Lifecycle Key",
      },
    );
    const keyId = createRes.body.apiKey!.id;

    const getRes = await apiCall(
      "GET",
      `/v1/organizations/${orgId}/workspaces/${wsId}/api-keys/${keyId}`,
    );
    expect(getRes.status).toBe(200);
    const getData = getRes.body.data as unknown as { id: string; name: string };
    expect(getData.id).toBe(keyId);

    const patchRes = await apiCall(
      "PATCH",
      `/v1/organizations/${orgId}/workspaces/${wsId}/api-keys/${keyId}`,
      {
        name: "Updated Key Name",
      },
    );
    expect(patchRes.status).toBe(200);
    const patchData = patchRes.body.data as unknown as {
      id: string;
      name: string;
    };
    expect(patchData.name).toBe("Updated Key Name");

    const deleteRes = await apiCall(
      "DELETE",
      `/v1/organizations/${orgId}/workspaces/${wsId}/api-keys/${keyId}`,
    );
    expect(deleteRes.status).toBe(200);
    const deleteData = deleteRes.body.data as unknown as { status: string };
    expect(deleteData.status).toBe("revoked");
  });

  it("rotates API key via POST /:id/rotate", async () => {
    const createRes = await apiCall(
      "POST",
      `/v1/organizations/${orgId}/workspaces/${wsId}/api-keys`,
      {
        name: "Key To Rotate",
      },
    );
    const keyId = createRes.body.apiKey!.id;

    const rotateRes = await apiCall(
      "POST",
      `/v1/organizations/${orgId}/workspaces/${wsId}/api-keys/${keyId}/rotate`,
      {
        overlapMinutes: 0,
        reason: "Routine Key Rotation",
      },
    );

    expect(rotateRes.status).toBe(200);
    expect(rotateRes.headers["cache-control"]).toContain("no-store");
    expect(rotateRes.body.apiKey!.id).not.toBe(keyId);
    expect(rotateRes.body.secret).toBeDefined();
    expect(rotateRes.body.oldApiKey!.status).toBe("revoked");
  });

  it("verifies GET /v1/auth/check endpoint for machine authentication", async () => {
    const createRes = await apiCall(
      "POST",
      `/v1/organizations/${orgId}/workspaces/${wsId}/api-keys`,
      {
        name: "Check Auth Key",
      },
    );
    const secret = createRes.body.secret;

    const checkRes = await apiCall("GET", "/v1/auth/check", undefined, {
      authorization: `Bearer ${secret}`,
    });

    expect(checkRes.status).toBe(200);
    expect(checkRes.body.status).toBe("ok");
    expect(checkRes.body.principal!.actorType).toBe("apiKey");
  });

  it("rejects query-parameter API keys with HTTP 400", async () => {
    const res = await apiCall("GET", "/v1/auth/check?api_key=gx_live_somekey");
    expect(res.status).toBe(400);
    expect(res.body.error!.code).toBe("INVALID_CREDENTIAL_LOCATION");
  });
});
