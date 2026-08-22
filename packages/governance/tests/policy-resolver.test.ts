import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryGovernanceRepository } from "../src/repository.js";
import { GovernancePolicyResolver } from "../src/policy-resolver.js";
import type { RetentionPolicy } from "@growx/contracts";

describe("GovernancePolicyResolver", () => {
  let repo: InMemoryGovernanceRepository;
  let resolver: GovernancePolicyResolver;

  beforeEach(() => {
    repo = new InMemoryGovernanceRepository();
    resolver = new GovernancePolicyResolver(repo);
  });

  it("resolves policy by deterministic precedence (workspace > org > platform)", async () => {
    const platformPolicy: RetentionPolicy = {
      id: "ret_plat",
      scope: "platform_default",
      durationDays: 30,
      action: "DELETE",
      priority: 10,
      version: 1,
      status: "active",
      createdAt: new Date(),
    };
    const orgPolicy: RetentionPolicy = {
      id: "ret_org",
      scope: "organization",
      scopeId: "org_test",
      durationDays: 14,
      action: "DELETE",
      priority: 50,
      version: 1,
      status: "active",
      createdAt: new Date(),
    };
    const wsPolicy: RetentionPolicy = {
      id: "ret_ws",
      scope: "workspace",
      scopeId: "ws_test",
      durationDays: 7,
      action: "DELETE",
      priority: 100,
      version: 1,
      status: "active",
      createdAt: new Date(),
    };

    await repo.createPolicy(platformPolicy);
    await repo.createPolicy(orgPolicy);
    await repo.createPolicy(wsPolicy);

    // Workspace context resolves to wsPolicy (7 days)
    const resolvedWs = await resolver.resolvePolicy({
      organizationId: "org_test",
      workspaceId: "ws_test",
      category: "prompt",
    });
    expect(resolvedWs.id).toBe("ret_ws");
    expect(resolvedWs.durationDays).toBe(7);

    // Organization context without workspace resolves to orgPolicy (14 days)
    const resolvedOrg = await resolver.resolvePolicy({
      organizationId: "org_test",
      category: "prompt",
    });
    expect(resolvedOrg.id).toBe("ret_org");
    expect(resolvedOrg.durationDays).toBe(14);
  });

  it("calculates zero-retention expiration correctly", () => {
    const zeroPolicy: RetentionPolicy = {
      id: "ret_zero",
      scope: "organization",
      durationDays: 0,
      action: "DELETE",
      priority: 100,
      version: 1,
      status: "active",
      createdAt: new Date(),
    };
    const now = new Date();
    const exp = resolver.calculateExpirationDate(zeroPolicy, now);
    expect(exp?.getTime()).toBe(now.getTime());
  });
});
