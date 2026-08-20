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

describe("Customer Model Catalog Visibility & Serializer Tests", () => {
  let repository: InMemoryModelRegistryRepository;
  let events: InMemoryModelRegistryEvents;
  let service: ModelRegistryService;
  let privilegedAuth: InMemoryPrivilegedAuthResolver;
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    repository = new InMemoryModelRegistryRepository();
    events = new InMemoryModelRegistryEvents();
    service = new ModelRegistryService(repository, events);
    privilegedAuth = new InMemoryPrivilegedAuthResolver(events);

    // Seed: 1 public active model
    await service.createModel(
      {
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
      "usr_admin"
    );

    // Seed: 1 hidden / internal model (customerVisible: false)
    await service.createModel(
      {
        canonicalId: "internal/guardrail-eval-v1",
        displayName: "Internal Guardrail",
        family: "internal",
        category: "chat",
        status: "active",
        customerVisible: false,
        routingEligible: true,
        contextWindow: 32_000,
        maxOutputTokens: 2048,
        supportsStreaming: true,
        supportsTools: false,
        supportsStructuredOutput: false,
        supportsReasoning: false,
        inputModalities: ["text"],
        outputModalities: ["text"],
        capabilities: ["text.generate"],
      },
      "usr_admin"
    );

    // Seed: 1 draft model
    await service.createModel(
      {
        canonicalId: "anthropic/claude-3-7-sonnet",
        displayName: "Claude 3.7 Sonnet Draft",
        family: "claude",
        category: "chat",
        status: "draft",
        customerVisible: true,
        routingEligible: false,
        contextWindow: 200_000,
        maxOutputTokens: 8192,
        supportsStreaming: true,
        supportsTools: false,
        supportsStructuredOutput: false,
        supportsReasoning: false,
        inputModalities: ["text"],
        outputModalities: ["text"],
        capabilities: ["text.generate"],
      },
      "usr_admin"
    );

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

  it("lists only customerVisible=true and non-draft models on GET /v1/models", async () => {
    const res = await makeRequest(`${baseUrl}/v1/models`);
    expect(res.status).toBe(200);
    expect(res.body.object).toBe("list");
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].canonicalId).toBe("openai/gpt-4o");

    // Ensure internal routes and metadata are not leaked in customer item
    expect(res.body.data[0].routes).toBeUndefined();
    expect(res.body.data[0].providerId).toBeUndefined();
  });

  it("denies direct access to hidden model on GET /v1/models/:modelId with 404", async () => {
    const res = await makeRequest(`${baseUrl}/v1/models/internal%2Fguardrail-eval-v1`);
    expect(res.status).toBe(404);
  });

  it("formats models correctly for OpenAI compatibility on GET /v1/openai/models", async () => {
    const res = await makeRequest(`${baseUrl}/v1/openai/models`);
    expect(res.status).toBe(200);
    expect(res.body.object).toBe("list");
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toEqual({
      id: "openai/gpt-4o",
      object: "model",
      created: expect.any(Number),
      owned_by: "gpt",
    });
  });
});
