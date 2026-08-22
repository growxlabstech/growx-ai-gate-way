import { describe, expect, it, beforeEach } from "vitest";
import {
  createApp,
  InMemoryRoutingRepository,
  InMemoryRoutingEvents,
} from "../src/index.js";
import { InMemoryPrivilegedAuthResolver } from "../src/transport/privileged-auth.js";
import { DefaultCustomerAuthResolver } from "../src/transport/customer-auth.js";
import type { Server } from "node:http";

describe("Routing Service HTTP Management Endpoints", () => {
  let server: Server;
  let baseUrl: string;
  let repository: InMemoryRoutingRepository;
  let events: InMemoryRoutingEvents;
  let privilegedAuth: InMemoryPrivilegedAuthResolver;
  let customerAuth: DefaultCustomerAuthResolver;

  beforeEach(async () => {
    repository = new InMemoryRoutingRepository();
    events = new InMemoryRoutingEvents();
    privilegedAuth = new InMemoryPrivilegedAuthResolver(events);
    customerAuth = new DefaultCustomerAuthResolver();

    server = createApp({
      repository,
      events,
      privilegedAuth,
      customerAuth,
    });

    await new Promise<void>((resolve) => {
      server.listen(0, () => resolve());
    });

    const address = server.address() as any;
    baseUrl = `http://localhost:${address.port}`;
  });

  it("returns 200 on /health", async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.service).toBe("routing-service");
  });

  describe("Customer Workspace Routing Policy API", () => {
    it("denies access without authorization header (401)", async () => {
      const res = await fetch(`${baseUrl}/v1/workspaces/ws_1/routing-policy`);
      expect(res.status).toBe(401);
    });

    it("denies access when lacking workspace.routing.manage capability (403)", async () => {
      customerAuth.addContext("cust-token-viewer", {
        userId: "usr_viewer",
        organizationId: "org_1",
        workspaceId: "ws_1",
        permissions: ["model.read"], // lacks routing.read or workspace.routing.manage
      });

      const res = await fetch(`${baseUrl}/v1/workspaces/ws_1/routing-policy`, {
        headers: { Authorization: "Bearer cust-token-viewer" },
      });
      expect(res.status).toBe(403);
    });

    it("retrieves effective policy for workspace (200)", async () => {
      customerAuth.addContext("cust-token-admin", {
        userId: "usr_admin",
        organizationId: "org_1",
        workspaceId: "ws_1",
        permissions: ["workspace.routing.manage"],
      });

      const res = await fetch(`${baseUrl}/v1/workspaces/ws_1/routing-policy`, {
        headers: { Authorization: "Bearer cust-token-admin" },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.policy).toBeDefined();
      expect(body.policy.strategy).toBe("priority");
    });

    it("creates or updates workspace routing policy (201/200)", async () => {
      customerAuth.addContext("cust-token-admin", {
        userId: "usr_admin",
        organizationId: "org_1",
        workspaceId: "ws_1",
        permissions: ["workspace.routing.manage"],
      });

      const putRes = await fetch(
        `${baseUrl}/v1/workspaces/ws_1/routing-policy`,
        {
          method: "PUT",
          headers: {
            Authorization: "Bearer cust-token-admin",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            strategy: "lowest_cost",
            deniedProviders: ["provider_expensive"],
            dataRegion: "india",
            maxEstimatedProviderCost: 0.5,
          }),
        },
      );

      expect(putRes.status).toBe(201);
      const putBody = await putRes.json();
      expect(putBody.policy.strategy).toBe("lowest_cost");
      expect(putBody.policy.deniedProviders).toContain("provider_expensive");
      expect(putBody.policy.dataRegion).toBe("india");

      // Verify event was emitted
      expect(events.createdEvents.length).toBe(1);
      expect(events.createdEvents[0]!.policy.strategy).toBe("lowest_cost");
    });
  });

  describe("Privileged Routing API", () => {
    it("denies access without privileged session (401)", async () => {
      const res = await fetch(`${baseUrl}/internal/routing/policies`);
      expect(res.status).toBe(401);
    });

    it("denies access without ops.routing.manage capability and emits security event", async () => {
      privilegedAuth.addSession("priv-token-readonly", {
        userId: "admin_1",
        capabilities: ["ops.models.read"], // lacks ops.routing.manage
        expiresAt: new Date(Date.now() + 60_000),
      });

      const res = await fetch(`${baseUrl}/internal/routing/policies`, {
        headers: { Authorization: "Bearer priv-token-readonly" },
      });
      expect(res.status).toBe(403);
      expect(events.securityEvents.length).toBe(1);
      expect(events.securityEvents[0]!.type).toBe(
        "security.privileged.unauthorized_routing_access",
      );
    });

    it("updates global routing policy when holding ops.routing.manage", async () => {
      privilegedAuth.addSession("priv-token-ops", {
        userId: "admin_super",
        capabilities: ["ops.routing.manage"],
        expiresAt: new Date(Date.now() + 60_000),
      });

      const patchRes = await fetch(`${baseUrl}/internal/routing/global`, {
        method: "PATCH",
        headers: {
          Authorization: "Bearer priv-token-ops",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          strategy: "balanced",
          deniedProviders: ["emergency_blocked_provider"],
        }),
      });

      expect(patchRes.status).toBe(200);
      const patchBody = await patchRes.json();
      expect(patchBody.policy.strategy).toBe("balanced");
      expect(patchBody.policy.deniedProviders).toContain(
        "emergency_blocked_provider",
      );

      expect(events.globalUpdatedEvents.length).toBe(1);
    });
  });
});
