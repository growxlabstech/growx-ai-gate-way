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

describe("Provider Execution Integration Tests", () => {
  it("executes route with decrypted credential through mock OpenAI provider", async () => {
    let capturedAuth: string | undefined = undefined;

    const mockServer = http.createServer((req, res) => {
      capturedAuth = req.headers["authorization"];
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          id: "chatcmpl-exec-test",
          choices: [
            {
              message: {
                role: "assistant",
                content: "Executed successfully via ProviderService!",
              },
              finish_reason: "stop",
            },
          ],
          usage: {
            prompt_tokens: 18,
            completion_tokens: 9,
            total_tokens: 27,
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
        name: "test-account",
        environment: "production",
        rawSecret: "mock-proj-decrypted-secret-key",
      },
      "usr_operator_1",
    );

    const route: ResolvedExecutionRoute = {
      providerId: provider.id,
      providerModelId: "gpt-4o",
      capabilities: ["text.generate", "streaming"],
      credentialId: credential.id,
    };

    const request: NormalizedGenerationRequest = {
      requestId: "req_exec_1",
      canonicalModelId: "openai/gpt-4o",
      providerModelId: "gpt-4o",
      messages: [{ role: "user", content: "Run test" }],
    };

    try {
      const response = await service.executeRoute(route, request, {
        organizationId: "org_test",
        workspaceId: "ws_test",
        apiKeyId: "key_test",
      });

      expect(response.requestId).toBe("req_exec_1");
      expect(response.providerId).toBe(provider.id);
      expect(response.output[0]?.content).toBe(
        "Executed successfully via ProviderService!",
      );
      expect(response.usage.totalTokens).toBe(27);
      expect(capturedAuth).toBe("Bearer mock-proj-decrypted-secret-key");
    } finally {
      mockServer.close();
    }
  });

  it("streams route with deltas and usage through mock Anthropic provider", async () => {
    let capturedApiKey: string | undefined = undefined;

    const mockServer = http.createServer((req, res) => {
      capturedApiKey = req.headers["x-api-key"] as string;
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      });

      const sse = [
        `event: message_start\ndata: {"type":"message_start","message":{"id":"msg_stream","usage":{"input_tokens":12}}}\n\n`,
        `event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n`,
        `event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Streaming "}}\n\n`,
        `event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"success!"}}\n\n`,
        `event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n`,
        `event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":6}}\n\n`,
        `event: message_stop\ndata: {"type":"message_stop"}\n\n`,
      ];

      for (const line of sse) {
        res.write(line);
      }
      res.end();
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
        code: "anthropic",
        displayName: "Anthropic",
        adapterType: "anthropic",
        baseUrl,
      },
      "usr_operator_1",
    );

    const credential = await service.createCredential(
      provider.id,
      {
        name: "test-anthropic",
        environment: "production",
        rawSecret: "mock-ant-anthropic-secret-key",
      },
      "usr_operator_1",
    );

    const route: ResolvedExecutionRoute = {
      providerId: provider.id,
      providerModelId: "claude-3-5-sonnet-20241022",
      capabilities: ["text.generate", "streaming"],
      credentialId: credential.id,
    };

    const request: NormalizedGenerationRequest = {
      requestId: "req_exec_stream",
      canonicalModelId: "anthropic/claude-3-5-sonnet",
      providerModelId: "claude-3-5-sonnet-20241022",
      messages: [{ role: "user", content: "Stream me" }],
      stream: true,
    };

    try {
      const eventsList: any[] = [];
      for await (const evt of service.streamRoute(route, request)) {
        eventsList.push(evt);
      }

      expect(capturedApiKey).toBe("mock-ant-anthropic-secret-key");

      const deltas = eventsList
        .filter((e) => e.type === "output_text.delta")
        .map((e) => e.delta)
        .join("");
      expect(deltas).toBe("Streaming success!");

      const completed = eventsList.find((e) => e.type === "response.completed");
      expect(completed.response.output[0]?.content).toBe("Streaming success!");
      expect(completed.usage.inputTokens).toBe(12);
      expect(completed.usage.outputTokens).toBe(6);
    } finally {
      mockServer.close();
    }
  });
});
