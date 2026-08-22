/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from "vitest";
import { defaultAdapterRegistry } from "@growx/provider-sdk";
import http from "node:http";
import { ProviderCredentialCrypto } from "../../src/application/credential-crypto.js";
import { ProviderService } from "../../src/application/provider-service.js";
import { InMemoryProviderEvents } from "../../src/infrastructure/events.js";
import { InMemoryProviderRepository } from "../../src/infrastructure/in-memory-repository.js";
import type { ResolvedExecutionRoute } from "../../src/domain/types.js";
import type { NormalizedGenerationRequest } from "@growx/contracts";

describe("Concurrency & Race Condition Tests", () => {
  it("handles high concurrency provider executions without race condition", async () => {
    let requestCount = 0;

    const mockServer = http.createServer((req, res) => {
      requestCount++;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          id: `chatcmpl-conc-${requestCount}`,
          choices: [
            {
              message: {
                role: "assistant",
                content: `Response #${requestCount}`,
              },
              finish_reason: "stop",
            },
          ],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 5,
            total_tokens: 15,
          },
        }),
      );
    });

    await new Promise<void>((resolve) =>
      mockServer.listen(0, "127.0.0.1", resolve),
    );
    const port = (mockServer.address() as any).port;
    const baseUrl = `http://127.0.0.1:${port}`;

    const repository = new InMemoryProviderRepository();
    const events = new InMemoryProviderEvents();
    const crypto = new ProviderCredentialCrypto();
    const service = new ProviderService(
      repository,
      events,
      crypto,
      defaultAdapterRegistry,
    );

    const provider = await service.createProvider(
      {
        code: "openai",
        displayName: "OpenAI",
        adapterType: "openai",
        baseUrl,
      },
      "usr_operator_1",
    );

    const credential = await service.createCredential(
      provider.id,
      {
        name: "concurrent-key",
        environment: "production",
        rawSecret: "sk-concurrent-test-key",
      },
      "usr_operator_1",
    );

    const route: ResolvedExecutionRoute = {
      providerId: provider.id,
      providerModelId: "gpt-4o",
      capabilities: ["text.generate"],
      credentialId: credential.id,
    };

    const totalRequests = 25;
    const promises = Array.from({ length: totalRequests }).map((_, i) => {
      const req: NormalizedGenerationRequest = {
        requestId: `req_conc_${i}`,
        canonicalModelId: "openai/gpt-4o",
        providerModelId: "gpt-4o",
        messages: [{ role: "user", content: `Concurrent ping ${i}` }],
      };
      return service.executeRoute(route, req);
    });

    try {
      const results = await Promise.all(promises);
      expect(results.length).toBe(totalRequests);
      for (const res of results) {
        expect(res.finishReason).toBe("stop");
        expect(res.usage.totalTokens).toBe(15);
      }
      expect(requestCount).toBe(totalRequests);
    } finally {
      mockServer.close();
    }
  });

  it("handles concurrent credential rotations safely", async () => {
    const repository = new InMemoryProviderRepository();
    const events = new InMemoryProviderEvents();
    const crypto = new ProviderCredentialCrypto();
    const service = new ProviderService(
      repository,
      events,
      crypto,
      defaultAdapterRegistry,
    );

    const provider = await service.createProvider(
      {
        code: "anthropic",
        displayName: "Anthropic",
        adapterType: "anthropic",
        baseUrl: "https://api.anthropic.com",
      },
      "usr_operator_1",
    );

    const credential = await service.createCredential(
      provider.id,
      {
        name: "rotating-key",
        environment: "production",
        rawSecret: "sk-ant-rot-init",
      },
      "usr_operator_1",
    );

    const rotations = Array.from({ length: 5 }).map((_, idx) =>
      service.rotateCredential(
        credential.id,
        {
          newRawSecret: `sk-ant-rot-${idx}`,
          reason: `Concurrent rotation ${idx}`,
        },
        `usr_operator_${idx}`,
      ),
    );

    const results = await Promise.all(rotations);
    expect(results.length).toBe(5);

    const finalCred = await repository.getCredentialById(credential.id);
    expect(finalCred).not.toBeNull();
    const decrypted = crypto.decrypt(
      finalCred!.encryptedPayload,
      finalCred!.encryptionKeyVersion,
    );
    expect(decrypted).toMatch(/^sk-ant-rot-\d$/);
  });
});
