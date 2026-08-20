/* eslint-disable @typescript-eslint/no-explicit-any */
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  createPromptRequestSchema,
  updatePromptRequestSchema,
  createPromptVersionRequestSchema,
  createPromptReleaseRequestSchema,
  rollbackPromptReleaseRequestSchema,
  renderPromptRequestSchema,
  validatePromptRequestSchema,
} from "@growx/contracts";
import { PromptTemplateRenderer, PromptLinter, PromptDiffUtil } from "@growx/prompts";
import type { PromptService } from "../application/prompt-service.js";
import type { PromptResolver } from "../application/prompt-resolver.js";

function readJsonBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 5 * 1024 * 1024) {
        reject(new Error("Payload too large"));
      }
    });
    req.on("end", () => {
      if (!raw.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("Malformed JSON body"));
      }
    });
    req.on("error", reject);
  });
}

export function createPromptHttpHandler(
  promptService: PromptService,
  promptResolver?: PromptResolver | undefined,
  serviceName = "prompt-service"
) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const urlObj = new URL(req.url ?? "/", "http://localhost");
    const pathname = urlObj.pathname.replace(/\/+$/, "") || "/";
    const method = req.method?.toUpperCase() ?? "GET";

    // -------------------------------------------------------------
    // Health Probes
    // -------------------------------------------------------------
    if (pathname === "/health" || pathname === "/live" || pathname === "/ready") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          status: "ok",
          service: serviceName,
          timestamp: new Date().toISOString(),
        })
      );
      return;
    }

    try {
      // Mock / Extract tenant context from headers (or mock context for testing)
      const organizationId = (req.headers["x-organization-id"] as string) || "org_default";
      const workspaceId = (req.headers["x-workspace-id"] as string) || undefined;
      const actorId = (req.headers["x-actor-id"] as string) || "usr_operator";

      // -------------------------------------------------------------
      // 1. Prompts CRUD
      // -------------------------------------------------------------

      // POST /v1/prompts
      if (pathname === "/v1/prompts" && method === "POST") {
        const body = await readJsonBody(req);
        const input = createPromptRequestSchema.parse(body);
        const result = await promptService.createPrompt(organizationId, workspaceId, input, actorId);
        res.writeHead(201, { "content-type": "application/json" });
        res.end(JSON.stringify(result));
        return;
      }

      // GET /v1/prompts
      if (pathname === "/v1/prompts" && method === "GET") {
        const prompts = await promptService.listPrompts({ organizationId, workspaceId });
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ items: prompts }));
        return;
      }

      // GET /v1/prompts/:id
      const promptIdMatch = pathname.match(/^\/v1\/prompts\/([^\/]+)$/);
      if (promptIdMatch && method === "GET") {
        const promptId = promptIdMatch[1]!;
        const prompt = await promptService.getPrompt(organizationId, promptId);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(prompt));
        return;
      }

      // PATCH /v1/prompts/:id
      if (promptIdMatch && method === "PATCH") {
        const promptId = promptIdMatch[1]!;
        const body = await readJsonBody(req);
        const input = updatePromptRequestSchema.parse(body);
        const updated = await promptService.updatePrompt(organizationId, promptId, input, actorId);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(updated));
        return;
      }

      // DELETE /v1/prompts/:id (archive)
      if (promptIdMatch && method === "DELETE") {
        const promptId = promptIdMatch[1]!;
        const archived = await promptService.archivePrompt(organizationId, promptId, actorId);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(archived));
        return;
      }

      // -------------------------------------------------------------
      // 2. Versions
      // -------------------------------------------------------------

      // POST /v1/prompts/:id/versions
      const versionsMatch = pathname.match(/^\/v1\/prompts\/([^\/]+)\/versions$/);
      if (versionsMatch && method === "POST") {
        const promptId = versionsMatch[1]!;
        const body = await readJsonBody(req);
        const input = createPromptVersionRequestSchema.parse(body);
        const version = await promptService.createVersion(organizationId, promptId, input, actorId);
        res.writeHead(201, { "content-type": "application/json" });
        res.end(JSON.stringify(version));
        return;
      }

      // GET /v1/prompts/:id/versions
      if (versionsMatch && method === "GET") {
        const promptId = versionsMatch[1]!;
        const versions = await promptService.listVersions(organizationId, promptId);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ items: versions }));
        return;
      }

      // GET /v1/prompts/:id/versions/:verNum
      const singleVerMatch = pathname.match(/^\/v1\/prompts\/([^\/]+)\/versions\/(\d+)$/);
      if (singleVerMatch && method === "GET") {
        const promptId = singleVerMatch[1]!;
        const verNum = parseInt(singleVerMatch[2]!, 10);
        const version = await promptService.getVersion(organizationId, promptId, verNum);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(version));
        return;
      }

      // -------------------------------------------------------------
      // 3. Releases & Rollback
      // -------------------------------------------------------------

      // POST /v1/prompts/:id/releases
      const releasesMatch = pathname.match(/^\/v1\/prompts\/([^\/]+)\/releases$/);
      if (releasesMatch && method === "POST") {
        const promptId = releasesMatch[1]!;
        const body = await readJsonBody(req);
        const input = createPromptReleaseRequestSchema.parse(body);
        const release = await promptService.createRelease(organizationId, promptId, input, actorId);
        res.writeHead(201, { "content-type": "application/json" });
        res.end(JSON.stringify(release));
        return;
      }

      // POST /v1/prompts/:id/rollback
      const rollbackMatch = pathname.match(/^\/v1\/prompts\/([^\/]+)\/rollback$/);
      if (rollbackMatch && method === "POST") {
        const promptId = rollbackMatch[1]!;
        const body = await readJsonBody(req);
        const input = rollbackPromptReleaseRequestSchema.parse(body);
        const release = await promptService.rollbackRelease(organizationId, promptId, input, actorId);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(release));
        return;
      }

      // -------------------------------------------------------------
      // 4. Render & Validation Preview
      // -------------------------------------------------------------

      // POST /v1/prompts/:id/render
      const renderMatch = pathname.match(/^\/v1\/prompts\/([^\/]+)\/render$/);
      if (renderMatch && method === "POST") {
        const promptId = renderMatch[1]!;
        const body = await readJsonBody(req);
        const prompt = await promptService.getPrompt(organizationId, promptId);
        let version: any;
        if (body.version) {
          version = await promptService.getVersion(organizationId, promptId, body.version);
        } else if (promptResolver) {
          const resolved = await promptResolver.resolve(organizationId, prompt.key, body.environment || "production", workspaceId);
          version = resolved.version;
        } else {
          const versions = await promptService.listVersions(organizationId, promptId);
          version = versions[0];
        }

        const rendered = PromptTemplateRenderer.render(version, body.variables || {});
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(rendered));
        return;
      }

      // POST /v1/prompts/validate
      if (pathname === "/v1/prompts/validate" && method === "POST") {
        const body = await readJsonBody(req);
        const input = validatePromptRequestSchema.parse(body);
        const issues = PromptLinter.lint(input.messages, input.template, input.variableSchema);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ valid: issues.filter(i => i.severity === "error").length === 0, issues }));
        return;
      }

      // GET /v1/prompts/:id/versions/:vA/diff/:vB
      const diffMatch = pathname.match(/^\/v1\/prompts\/([^\/]+)\/versions\/(\d+)\/diff\/(\d+)$/);
      if (diffMatch && method === "GET") {
        const promptId = diffMatch[1]!;
        const vA = parseInt(diffMatch[2]!, 10);
        const vB = parseInt(diffMatch[3]!, 10);
        const versionA = await promptService.getVersion(organizationId, promptId, vA);
        const versionB = await promptService.getVersion(organizationId, promptId, vB);
        const diff = PromptDiffUtil.diff(versionA, versionB);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(diff));
        return;
      }

      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "not_found", message: "Endpoint not found" }));
    } catch (err: any) {
      const statusCode = err.statusCode || err.status || (err.name === "ZodError" ? 400 : 500);
      res.writeHead(statusCode, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          error: err.code || "prompt_error",
          message: err.message || "An unexpected error occurred",
        })
      );
    }
  };
}
