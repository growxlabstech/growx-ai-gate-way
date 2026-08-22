import { describe, expect, it, beforeEach } from "vitest";
import {
  ApiKeyService,
  InMemoryApiKeyRepository,
  InMemoryLifecycleEvents,
} from "../src/api-keys.js";

const PEPPER = "p".repeat(32);

describe("Tenant Isolation & Lifecycle Bounds", () => {
  let repository: InMemoryApiKeyRepository;
  let events: InMemoryLifecycleEvents;
  let service: ApiKeyService;

  beforeEach(() => {
    repository = new InMemoryApiKeyRepository();
    events = new InMemoryLifecycleEvents();
    service = new ApiKeyService(repository, events, PEPPER);
  });

  it("ensures key for Workspace A cannot authenticate or access Workspace B context", async () => {
    const keyA = await service.create({
      organizationId: "org_alpha",
      workspaceId: "ws_alpha",
      environmentId: "env_alpha",
      environment: "production",
      name: "Alpha Key",
      createdBy: "usr_alpha",
    });

    const keyB = await service.create({
      organizationId: "org_beta",
      workspaceId: "ws_beta",
      environmentId: "env_beta",
      environment: "production",
      name: "Beta Key",
      createdBy: "usr_beta",
    });

    // Key A authenticates strictly as org_alpha and ws_alpha
    const authA = await service.authenticate(keyA.secret);
    expect(authA.allowed).toBe(true);
    if (authA.allowed) {
      expect(authA.context.organizationId).toBe("org_alpha");
      expect(authA.context.workspaceId).toBe("ws_alpha");
      expect(authA.context.workspaceId).not.toBe("ws_beta");
    }

    // Key B authenticates strictly as org_beta and ws_beta
    const authB = await service.authenticate(keyB.secret);
    expect(authB.allowed).toBe(true);
    if (authB.allowed) {
      expect(authB.context.organizationId).toBe("org_beta");
      expect(authB.context.workspaceId).toBe("ws_beta");
    }

    // Cross-tenant lookup fails closed
    const lookupAFromB = await service.get(
      "org_beta",
      "ws_beta",
      keyA.record.id,
    );
    expect(lookupAFromB).toBeNull();

    // Cross-tenant update fails closed
    await expect(
      service.update("org_beta", "ws_beta", keyA.record.id, {
        name: "Hacked Key Name",
        actorId: "usr_beta",
      }),
    ).rejects.toThrow(/API key not found/);

    // Cross-tenant revoke fails closed
    await expect(
      service.revoke("org_beta", "ws_beta", keyA.record.id, "usr_beta"),
    ).rejects.toThrow(/API key not found/);

    // Cross-tenant rotate fails closed
    await expect(
      service.rotate("org_beta", "ws_beta", keyA.record.id, "usr_beta"),
    ).rejects.toThrow(/API key not found/);
  });

  it("fails closed when organization is suspended or archived", async () => {
    const key = await service.create({
      organizationId: "org_suspended",
      workspaceId: "ws_active",
      environmentId: "env_active",
      environment: "production",
      name: "Suspended Org Key",
      createdBy: "usr_1",
    });

    repository.setTenantState("org_suspended", {
      organizationStatus: "suspended",
      workspaceStatus: "active",
      environmentStatus: "active",
    });

    const decision = await service.authenticate(key.secret);
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.code).toBe("organization_suspended");
      expect(decision.status).toBe(403);
    }
  });

  it("fails closed when workspace is suspended or archived", async () => {
    const key = await service.create({
      organizationId: "org_active",
      workspaceId: "ws_suspended",
      environmentId: "env_active",
      environment: "production",
      name: "Suspended Ws Key",
      createdBy: "usr_1",
    });

    repository.setTenantState("ws_suspended", {
      organizationStatus: "active",
      workspaceStatus: "suspended",
      environmentStatus: "active",
    });

    const decision = await service.authenticate(key.secret);
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.code).toBe("workspace_suspended");
      expect(decision.status).toBe(403);
    }
  });
});
