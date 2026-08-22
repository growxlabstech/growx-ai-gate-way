import { describe, expect, it } from "vitest";
import {
  listAdminAuditEvents,
  listAdminModels,
  listAdminOrganizations,
  listAdminProviders,
  listAdminRoutingPolicies,
  listAdminSecurityEvents,
  listAdminUsers,
  listAdminWorkspaces,
  loadAdminSummary,
} from "./admin-data";

describe("D9 GrowX Operator Admin & Control Plane Data Layer", () => {
  it("loads operational summary with active incidents and provider health", async () => {
    const summary = await loadAdminSummary();
    expect(summary.activeIncidentsCount).toBeGreaterThanOrEqual(1);
    expect(summary.totalUsersCount).toBeGreaterThan(0);
    expect(summary.totalOrganizationsCount).toBeGreaterThan(0);
    expect(summary.providerHealthSummary.length).toBeGreaterThanOrEqual(5);
    expect(summary.workerHealthSummary.length).toBeGreaterThanOrEqual(4);
  });

  it("lists global users with MFA status and suspension state", async () => {
    const users = await listAdminUsers();
    expect(users.length).toBeGreaterThanOrEqual(4);
    const superAdmin = users.find((u) => u.role === "Super Admin");
    expect(superAdmin).toBeDefined();
    expect(superAdmin?.mfaEnabled).toBe(true);

    const suspendedUser = users.find((u) => u.status === "suspended");
    expect(suspendedUser).toBeDefined();
  });

  it("lists organizations with workspace counts and spend totals", async () => {
    const orgs = await listAdminOrganizations();
    expect(orgs.length).toBeGreaterThanOrEqual(2);
    const ns = orgs.find((o) => o.slug === "northstar");
    expect(ns?.tier).toBe("Scale Enterprise");
    expect(ns?.workspacesCount).toBe(2);
  });

  it("lists upstream providers with circuit breaker states and drain modes", async () => {
    const providers = await listAdminProviders();
    expect(providers.length).toBeGreaterThanOrEqual(5);
    const openai = providers.find((p) => p.id === "openai");
    expect(openai?.status).toBe("healthy");
    expect(openai?.circuitState).toBe("closed");

    const mistral = providers.find((p) => p.id === "mistral");
    expect(mistral?.status).toBe("degraded");
    expect(mistral?.circuitState).toBe("half_open");
    expect(mistral?.isDraining).toBe(true);
  });

  it("lists model registry with capabilities and emergency status", async () => {
    const models = await listAdminModels();
    expect(models.length).toBeGreaterThanOrEqual(5);
    const gpt4o = models.find((m) => m.id === "gpt-4o");
    expect(gpt4o?.status).toBe("active");
    expect(gpt4o?.capabilities).toContain("vision");

    const disabledModel = models.find((m) => m.status === "disabled");
    expect(disabledModel?.id).toBe("mistral-large-2407");
  });

  it("lists Router V2 policies with strategy and hysteresis penalties", async () => {
    const policies = await listAdminRoutingPolicies();
    expect(policies.length).toBeGreaterThanOrEqual(2);
    const latencyPol = policies.find((p) => p.strategy === "latency_optimized");
    expect(latencyPol?.primaryRoute).toContain("groq");
    expect(latencyPol?.hysteresisPenaltyMs).toBe(50);
  });

  it("lists tamper-evident immutable audit events with SHA-256 hash chains", async () => {
    const audits = await listAdminAuditEvents();
    expect(audits.length).toBeGreaterThanOrEqual(3);
    for (const aud of audits) {
      expect(aud.status).toBe("success");
      expect(aud.hashChain).toMatch(/^sha256:/);
    }
  });

  it("lists security signals with severity classifications", async () => {
    const security = await listAdminSecurityEvents();
    expect(security.length).toBeGreaterThanOrEqual(2);
    expect(security[0].severity).toBe("medium");
    expect(security[1].severity).toBe("high");
  });
});
