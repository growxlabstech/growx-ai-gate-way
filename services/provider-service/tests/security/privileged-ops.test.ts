/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from "vitest";
import { defaultAdapterRegistry } from "@growx/provider-sdk";
import http from "node:http";
import { ProviderCredentialCrypto } from "../../src/application/credential-crypto.js";
import { ProviderService } from "../../src/application/provider-service.js";
import { InMemoryProviderEvents } from "../../src/infrastructure/events.js";
import { InMemoryProviderRepository } from "../../src/infrastructure/in-memory-repository.js";
import { InMemoryPrivilegedSessionResolver } from "../../src/transport/privileged-auth.js";
import { createHttpHandler } from "../../src/transport/http-routes.js";

describe("Privileged Provider Ops Security Tests", () => {
  const repository = new InMemoryProviderRepository();
  const events = new InMemoryProviderEvents();
  const crypto = new ProviderCredentialCrypto();
  const service = new ProviderService(
    repository,
    events,
    crypto,
    defaultAdapterRegistry,
  );
  const sessionResolver = new InMemoryPrivilegedSessionResolver();

  // Register an operator session with full provider admin capabilities
  sessionResolver.registerSession("valid_admin_token", {
    sessionId: "psess_admin_1",
    operatorId: "usr_admin_1",
    operatorEmail: "admin@growx.ai",
    capabilities: [
      "ops.providers.read",
      "ops.providers.write",
      "ops.providers.disable",
      "ops.providers.credentials.manage",
      "ops.providers.credentials.read",
    ],
    expiresAt: new Date(Date.now() + 3600_000),
  });

  // Register a read-only session
  sessionResolver.registerSession("readonly_token", {
    sessionId: "psess_ro_1",
    operatorId: "usr_ro_1",
    operatorEmail: "ro@growx.ai",
    capabilities: ["ops.providers.read"],
    expiresAt: new Date(Date.now() + 3600_000),
  });

  const handler = createHttpHandler(service, sessionResolver);
  const server = http.createServer(handler);

  it("rejects unauthenticated requests with 401 UNAUTHORIZED", async () => {
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const port = (server.address() as any).port;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      const res = await fetch(`${baseUrl}/internal/providers`);
      expect(res.status).toBe(401);
      const json = (await res.json()) as any;
      expect(json.error.code).toBe("UNAUTHORIZED");
    } finally {
      server.close();
    }
  });

  it("rejects customer API keys with 401 INVALID_PRINCIPAL", async () => {
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const port = (server.address() as any).port;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      const res = await fetch(`${baseUrl}/internal/providers`, {
        headers: { authorization: "Bearer gx_live_secret_key_for_customer" },
      });
      expect(res.status).toBe(401);
      const json = (await res.json()) as any;
      expect(json.error.code).toBe("INVALID_PRINCIPAL");
    } finally {
      server.close();
    }
  });

  it("rejects tokens in query parameters with 400 INVALID_CREDENTIAL_LOCATION", async () => {
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const port = (server.address() as any).port;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      const res = await fetch(
        `${baseUrl}/internal/providers?jit_token=valid_admin_token`,
      );
      expect(res.status).toBe(400);
      const json = (await res.json()) as any;
      expect(json.error.code).toBe("INVALID_CREDENTIAL_LOCATION");
    } finally {
      server.close();
    }
  });

  it("rejects write operations from read-only session with 403 FORBIDDEN", async () => {
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const port = (server.address() as any).port;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      const res = await fetch(`${baseUrl}/internal/providers`, {
        method: "POST",
        headers: {
          authorization: "Bearer readonly_token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          code: "groq",
          displayName: "Groq",
          adapterType: "groq",
          baseUrl: "https://api.groq.com/openai/v1",
        }),
      });

      expect(res.status).toBe(403);
      const json = (await res.json()) as any;
      expect(json.error.code).toBe("FORBIDDEN");
    } finally {
      server.close();
    }
  });

  it("allows write and credential operations from authorized session", async () => {
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const port = (server.address() as any).port;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      // Create provider
      const createRes = await fetch(`${baseUrl}/internal/providers`, {
        method: "POST",
        headers: {
          authorization: "Bearer valid_admin_token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          code: "mistral",
          displayName: "Mistral AI",
          adapterType: "mistral",
          baseUrl: "https://api.mistral.ai/v1",
        }),
      });

      expect(createRes.status).toBe(201);
      const createJson = (await createRes.json()) as any;
      expect(createJson.provider.code).toBe("mistral");

      // Add credential
      const credRes = await fetch(
        `${baseUrl}/internal/providers/mistral/credentials`,
        {
          method: "POST",
          headers: {
            authorization: "Bearer valid_admin_token",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            name: "mistral-prod",
            rawSecret: "mis_secret_production_key",
          }),
        },
      );

      expect(credRes.status).toBe(201);
      const credJson = (await credRes.json()) as any;
      expect(credJson.credential.name).toBe("mistral-prod");
      expect(credJson.credential.rawSecret).toBeUndefined();
    } finally {
      server.close();
    }
  });
});
