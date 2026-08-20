import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { createServer, request as httpRequest, type Server } from "node:http";
import { ModelRegistryService } from "../../src/application/model-registry-service.js";
import { InMemoryModelRegistryRepository } from "../../src/infrastructure/in-memory-repository.js";
import { InMemoryModelRegistryEvents } from "../../src/infrastructure/events.js";
import { InMemoryPrivilegedAuthResolver } from "../../src/transport/privileged-auth.js";
import { createModelRegistryHttpApp } from "../../src/transport/http-routes.js";

interface ApiResponse {
  status: number;
  body: any;
}

function makeRequest(
  url: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
  } = {}
): Promise<ApiResponse> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const bodyStr = options.body !== undefined ? JSON.stringify(options.body) : undefined;
    const req = httpRequest(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname + parsed.search,
        method: options.method ?? "GET",
        headers: {
          ...(bodyStr ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(bodyStr) } : {}),
          ...options.headers,
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf-8");
          let body = null;
          try {
            body = JSON.parse(raw);
          } catch {
            body = raw;
          }
          resolve({ status: res.statusCode ?? 0, body });
        });
      }
    );
    req.on("error", reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

describe("Privileged Operations Security Tests", () => {
  let repository: InMemoryModelRegistryRepository;
  let events: InMemoryModelRegistryEvents;
  let service: ModelRegistryService;
  let privilegedAuth: InMemoryPrivilegedAuthResolver;
  let server: Server;
  let baseUrl: string;

  const validSessionId = "jit_sess_valid_ops";
  const unprivilegedSessionId = "jit_sess_viewer_only";
  const expiredSessionId = "jit_sess_expired";
  const revokedSessionId = "jit_sess_revoked";

  beforeEach(async () => {
    repository = new InMemoryModelRegistryRepository();
    events = new InMemoryModelRegistryEvents();
    service = new ModelRegistryService(repository, events);
    privilegedAuth = new InMemoryPrivilegedAuthResolver(events);

    // Register test sessions
    privilegedAuth.registerSession({
      id: validSessionId,
      operatorId: "usr_superadmin",
      capabilities: ["ops.models.read", "ops.models.write", "ops.routes.manage", "ops.aliases.manage", "ops.pricing.manage"],
      expiresAt: new Date(Date.now() + 3_600_000), // +1 hour
    });

    privilegedAuth.registerSession({
      id: unprivilegedSessionId,
      operatorId: "usr_viewer",
      capabilities: ["ops.models.read"], // Only read capability
      expiresAt: new Date(Date.now() + 3_600_000),
    });

    privilegedAuth.registerSession({
      id: expiredSessionId,
      operatorId: "usr_admin",
      capabilities: ["ops.models.write"],
      expiresAt: new Date(Date.now() - 10_000), // expired
    });

    privilegedAuth.registerSession({
      id: revokedSessionId,
      operatorId: "usr_admin",
      capabilities: ["ops.models.write"],
      expiresAt: new Date(Date.now() + 3_600_000),
      revokedAt: new Date(),
    });

    const handler = createModelRegistryHttpApp({ service, privilegedAuth });
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

  it("denies unauthenticated requests to POST /internal/ops/models with 401", async () => {
    const res = await makeRequest(`${baseUrl}/internal/ops/models`, {
      method: "POST",
      body: {
        canonicalId: "openai/gpt-4o",
        displayName: "GPT-4o",
        family: "gpt",
        contextWindow: 128_000,
        maxOutputTokens: 4096,
      },
    });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("rejects machine API keys (gx_live_...) with 401 INVALID_PRINCIPAL", async () => {
    const res = await makeRequest(`${baseUrl}/internal/ops/models`, {
      method: "POST",
      headers: {
        authorization: "Bearer gx_live_secret_customer_key_12345",
      },
      body: {
        canonicalId: "openai/gpt-4o",
        displayName: "GPT-4o",
        family: "gpt",
        contextWindow: 128_000,
        maxOutputTokens: 4096,
      },
    });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_PRINCIPAL");
  });

  it("rejects credentials passed in URL query parameters with 400 INVALID_CREDENTIAL_LOCATION", async () => {
    const res = await makeRequest(`${baseUrl}/internal/ops/models?jit_token=${validSessionId}`, {
      method: "POST",
      body: {
        canonicalId: "openai/gpt-4o",
        displayName: "GPT-4o",
        family: "gpt",
        contextWindow: 128_000,
        maxOutputTokens: 4096,
      },
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_CREDENTIAL_LOCATION");
  });

  it("does not trust caller x-actor-id header and denies when session is missing", async () => {
    const res = await makeRequest(`${baseUrl}/internal/ops/models`, {
      method: "POST",
      headers: {
        "x-actor-id": "usr_superadmin",
        "x-role": "superadmin",
      },
      body: {
        canonicalId: "openai/gpt-4o",
        displayName: "GPT-4o",
        family: "gpt",
        contextWindow: 128_000,
        maxOutputTokens: 4096,
      },
    });

    expect(res.status).toBe(401);
  });

  it("denies JIT session lacking ops.models.write capability with 403 and emits security event", async () => {
    const res = await makeRequest(`${baseUrl}/internal/ops/models`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${unprivilegedSessionId}`,
      },
      body: {
        canonicalId: "openai/gpt-4o",
        displayName: "GPT-4o",
        family: "gpt",
        contextWindow: 128_000,
        maxOutputTokens: 4096,
      },
    });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");

    // Verify security event emission
    expect(events.security).toHaveLength(1);
    expect(events.security[0]?.type).toBe("security.privileged.unauthorized_model_access");
  });

  it("rejects expired JIT session with 401 SESSION_EXPIRED", async () => {
    const res = await makeRequest(`${baseUrl}/internal/ops/models`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${expiredSessionId}`,
      },
      body: {
        canonicalId: "openai/gpt-4o",
        displayName: "GPT-4o",
        family: "gpt",
        contextWindow: 128_000,
        maxOutputTokens: 4096,
      },
    });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("SESSION_EXPIRED");
  });

  it("rejects revoked JIT session with 401 SESSION_REVOKED", async () => {
    const res = await makeRequest(`${baseUrl}/internal/ops/models`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${revokedSessionId}`,
      },
      body: {
        canonicalId: "openai/gpt-4o",
        displayName: "GPT-4o",
        family: "gpt",
        contextWindow: 128_000,
        maxOutputTokens: 4096,
      },
    });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("SESSION_REVOKED");
  });

  it("allows valid JIT session with ops.models.write capability", async () => {
    const res = await makeRequest(`${baseUrl}/internal/ops/models`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${validSessionId}`,
      },
      body: {
        canonicalId: "openai/gpt-4o",
        displayName: "GPT-4o",
        family: "gpt",
        category: "chat",
        status: "active",
        customerVisible: true,
        routingEligible: true,
        contextWindow: 128_000,
        maxOutputTokens: 4096,
        supportsStreaming: true,
        supportsTools: true,
        supportsStructuredOutput: true,
        supportsReasoning: false,
        inputModalities: ["text"],
        outputModalities: ["text"],
        capabilities: ["text.generate", "streaming"],
      },
    });

    expect(res.status).toBe(201);
    expect(res.body.canonicalId).toBe("openai/gpt-4o");
  });
});
