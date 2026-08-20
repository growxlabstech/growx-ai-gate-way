import { describe, it, expect } from "vitest";
import http from "node:http";
import { InMemoryPromptRepository } from "../src/infrastructure/in-memory-repository.js";
import { InMemoryPromptEvents } from "../src/infrastructure/events.js";
import { PromptService } from "../src/application/prompt-service.js";
import { PromptResolver } from "../src/application/prompt-resolver.js";
import { createPromptHttpHandler } from "../src/transport/http-routes.js";

describe("Prompt Service HTTP API Routes", () => {
  const repo = new InMemoryPromptRepository();
  const events = new InMemoryPromptEvents();
  const resolver = new PromptResolver(repo);
  const service = new PromptService(repo, events, resolver);
  const handler = createPromptHttpHandler(service, resolver);
  const server = http.createServer(handler);

  it("executes full prompt management HTTP lifecycle (create, version, release, render, validate, diff)", async () => {
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as any).port;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      // 1. POST /v1/prompts
      const createRes = await fetch(`${baseUrl}/v1/prompts`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-organization-id": "org_http",
          "x-actor-id": "usr_dev",
        },
        body: JSON.stringify({
          key: "codegen.reviewer",
          name: "Code Reviewer",
          type: "structured_generation",
        }),
      });
      expect(createRes.status).toBe(201);
      const { prompt } = (await createRes.json()) as any;
      expect(prompt.id).toBeDefined();

      // 2. POST /v1/prompts/:id/versions
      const v1Res = await fetch(`${baseUrl}/v1/prompts/${prompt.id}/versions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-organization-id": "org_http",
        },
        body: JSON.stringify({
          messages: [{ role: "user", contentTemplate: "Review this code for {{language}}: {{code}}" }],
          variableSchema: [
            { name: "language", type: "string", required: true },
            { name: "code", type: "string", required: true },
          ],
        }),
      });
      expect(v1Res.status).toBe(201);
      const v1 = (await v1Res.json()) as any;
      expect(v1.version).toBe(1);

      // 3. POST /v1/prompts/:id/releases
      const relRes = await fetch(`${baseUrl}/v1/prompts/${prompt.id}/releases`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-organization-id": "org_http",
        },
        body: JSON.stringify({
          promptVersionId: v1.id,
          environment: "production",
          notes: "Initial release",
        }),
      });
      expect(relRes.status).toBe(201);

      // 4. POST /v1/prompts/:id/render (Preview)
      const renderRes = await fetch(`${baseUrl}/v1/prompts/${prompt.id}/render`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-organization-id": "org_http",
        },
        body: JSON.stringify({
          variables: {
            language: "typescript",
            code: "const x: number = 1;",
          },
        }),
      });
      expect(renderRes.status).toBe(200);
      const rendered = (await renderRes.json()) as any;
      expect(rendered.renderedMessages[0].content).toBe("Review this code for typescript: const x: number = 1;");

      // 5. POST /v1/prompts/validate
      const valRes = await fetch(`${baseUrl}/v1/prompts/validate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          template: "Hello {{name}} and {{role}}",
          variableSchema: [{ name: "name", type: "string", required: true }],
        }),
      });
      expect(valRes.status).toBe(200);
      const valJson = (await valRes.json()) as any;
      expect(valJson.valid).toBe(false);
      expect(valJson.issues.some((i: any) => i.code === "UNDEFINED_VARIABLE")).toBe(true);
    } finally {
      server.close();
    }
  });
});
