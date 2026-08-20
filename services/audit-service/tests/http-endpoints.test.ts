import { describe, expect, it, beforeEach } from "vitest";
import { InMemoryAuditRepository } from "../src/infrastructure/in-memory-repository.js";
import { AuditService } from "../src/application/audit-service.js";
import { SecurityService } from "../src/application/security-service.js";
import { createAuditHttpServer } from "../src/transport/http-server.js";

describe("Phase 22 — Audit & Security HTTP Endpoints", () => {
  let repository: InMemoryAuditRepository;
  let auditService: AuditService;
  let securityService: SecurityService;
  let server: any;

  beforeEach(() => {
    repository = new InMemoryAuditRepository();
    auditService = new AuditService(repository);
    securityService = new SecurityService(repository);
    server = createAuditHttpServer({ auditService, securityService });
  });

  it("handles health check and customer audit log query", async () => {
    // 1. Health check
    await new Promise<void>((resolve) => {
      const req = new (require("node:http").IncomingMessage)({} as any);
      req.url = "/health";
      req.method = "GET";

      const res = {
        writeHead: (status: number) => expect(status).toBe(200),
        end: (body: string) => {
          const json = JSON.parse(body);
          expect(json.status).toBe("ok");
          expect(json.service).toBe("audit-service");
          resolve();
        },
      } as any;

      server.emit("request", req, res);
    });

    // 2. Pre-populate an audit event
    await auditService.record({
      organizationId: "org_http_test",
      actorType: "user",
      actorId: "usr_alice",
      action: "api_key.created",
      resourceType: "api_key",
      sourceService: "api-key-service",
    });

    // 3. Customer query
    await new Promise<void>((resolve) => {
      const req = new (require("node:http").IncomingMessage)({} as any);
      req.url = "/v1/audit/events";
      req.method = "GET";
      req.headers = { "x-organization-id": "org_http_test" };

      const res = {
        writeHead: (status: number) => expect(status).toBe(200),
        end: (body: string) => {
          const json = JSON.parse(body);
          expect(json.events).toBeDefined();
          expect(json.events.length).toBe(1);
          resolve();
        },
      } as any;

      server.emit("request", req, res);
    });
  });
});
