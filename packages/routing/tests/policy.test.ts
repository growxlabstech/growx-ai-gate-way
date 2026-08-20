import { describe, expect, it } from "vitest";
import { mergeRoutingPolicies, type RoutingPolicy } from "../src/index.js";

describe("Routing Policy Precedence & Merging", () => {
  it("uses global default when no organization or workspace policies exist", () => {
    const merged = mergeRoutingPolicies([]);
    expect(merged.strategy).toBe("priority");
    expect(merged.enabled).toBe(true);
  });

  it("overrides strategy from organization policy when present", () => {
    const orgPolicy: RoutingPolicy = {
      id: "pol_org",
      organizationId: "org_123",
      name: "Org Policy",
      strategy: "lowest_cost",
      enabled: true,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const merged = mergeRoutingPolicies([orgPolicy]);
    expect(merged.strategy).toBe("lowest_cost");
  });

  it("overrides strategy from workspace policy over organization policy", () => {
    const orgPolicy: RoutingPolicy = {
      id: "pol_org",
      organizationId: "org_123",
      name: "Org Policy",
      strategy: "lowest_cost",
      enabled: true,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const wsPolicy: RoutingPolicy = {
      id: "pol_ws",
      organizationId: "org_123",
      workspaceId: "ws_456",
      name: "Workspace Policy",
      strategy: "lowest_latency",
      enabled: true,
      version: 2,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const merged = mergeRoutingPolicies([orgPolicy, wsPolicy]);
    expect(merged.strategy).toBe("lowest_latency");
    expect(merged.id).toBe("pol_ws");
  });

  it("strictly enforces that deny overrides allow across policy levels", () => {
    // Global allows all
    // Org allows ['openai', 'anthropic', 'google']
    // Workspace denies ['openai']
    const orgPolicy: RoutingPolicy = {
      id: "pol_org",
      organizationId: "org_123",
      name: "Org Policy",
      strategy: "priority",
      allowedProviders: ["openai", "anthropic", "google"],
      enabled: true,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const wsPolicy: RoutingPolicy = {
      id: "pol_ws",
      organizationId: "org_123",
      workspaceId: "ws_456",
      name: "Workspace Policy",
      strategy: "priority",
      deniedProviders: ["openai"],
      enabled: true,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const merged = mergeRoutingPolicies([orgPolicy, wsPolicy]);
    expect(merged.deniedProviders).toContain("openai");
    expect(merged.allowedProviders).toContain("anthropic");
    expect(merged.allowedProviders).toContain("google");
  });

  it("enforces data residency constraints from workspace", () => {
    const wsPolicy: RoutingPolicy = {
      id: "pol_ws",
      organizationId: "org_123",
      workspaceId: "ws_456",
      name: "Workspace Policy",
      strategy: "priority",
      dataRegion: "india",
      enabled: true,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const merged = mergeRoutingPolicies([wsPolicy]);
    expect(merged.dataRegion).toBe("india");
    expect(merged.requiredRegion).toBe("india");
  });

  it("applies the strictest (lowest) cost limit among policies", () => {
    const orgPolicy: RoutingPolicy = {
      id: "pol_org",
      organizationId: "org_123",
      name: "Org Policy",
      strategy: "priority",
      maxEstimatedProviderCost: 1.0,
      enabled: true,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const wsPolicy: RoutingPolicy = {
      id: "pol_ws",
      organizationId: "org_123",
      workspaceId: "ws_456",
      name: "Workspace Policy",
      strategy: "priority",
      maxEstimatedProviderCost: 0.25,
      enabled: true,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const merged = mergeRoutingPolicies([orgPolicy, wsPolicy]);
    expect(merged.maxEstimatedProviderCost).toBe(0.25);
  });
});
