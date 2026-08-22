import { describe, expect, it, beforeEach } from "vitest";
import { createTestGatewayFixture } from "../helpers/test-fixture.js";
import {
  EntitlementGate,
  type IEntitlementResolver,
} from "../../src/application/entitlement-gate.js";
import { ResolvedEntitlements } from "@growx/subscriptions";

describe("Phase 18 — Gateway Entitlement Gate Integration", () => {
  it("blocks execution when entitlement resolver denies model access", async () => {
    const mockResolver: IEntitlementResolver = {
      async resolveEntitlements(_orgId: string) {
        return new ResolvedEntitlements(
          new Map(),
          [
            { pattern: "anthropic/*", effect: "allow" },
            { pattern: "openai/*", effect: "deny" },
          ],
          [],
          new Set(),
          "pv_1",
          "free_plan",
        );
      },
    };

    const gate = new EntitlementGate(mockResolver);
    const fixture = await createTestGatewayFixture();
    (fixture.gatewayEngine as any).entitlementGate = gate;
    (fixture.gatewayEngine as any).entitlementGateEnabled = true;

    // openai/gpt-4o-mini is denied by the mock plan
    await expect(
      fixture.gatewayEngine.executeChatCompletion(
        {
          apiKeyId: "key_test",
          organizationId: "org_1",
          workspaceId: "ws_1",
          environmentId: "env_1",
          environment: "production",
          permissions: ["chat.completions.create"],
          rateLimits: [],
          modelRules: [],
          budget: { maxSpendMonthly: null, currentSpendMonthly: "0" },
        } as any,
        {
          model: "openai/gpt-4o-mini",
          messages: [{ role: "user", content: "hello" }],
        } as any,
      ),
    ).rejects.toThrow("denied by plan rule: openai/*");
  });

  it("allows execution when entitlement resolver permits model access", async () => {
    const mockResolver: IEntitlementResolver = {
      async resolveEntitlements(_orgId: string) {
        return new ResolvedEntitlements(
          new Map(),
          [{ pattern: "openai/*", effect: "allow" }],
          [],
          new Set(),
          "pv_2",
          "pro_plan",
        );
      },
    };

    const gate = new EntitlementGate(mockResolver);
    const fixture = await createTestGatewayFixture();
    (fixture.gatewayEngine as any).entitlementGate = gate;
    (fixture.gatewayEngine as any).entitlementGateEnabled = true;

    const response = await fixture.gatewayEngine.executeChatCompletion(
      {
        apiKeyId: "key_test",
        organizationId: "org_1",
        workspaceId: "ws_1",
        environmentId: "env_1",
        environment: "production",
        permissions: ["chat.completions.create"],
        rateLimits: [],
        modelRules: [],
        budget: { maxSpendMonthly: null, currentSpendMonthly: "0" },
      } as any,
      {
        model: "openai/gpt-4o-mini",
        messages: [{ role: "user", content: "hello" }],
      } as any,
    );

    expect(response).toBeDefined();
    expect(response.choices[0]?.message.content).toBe(
      "Hello from GrowX AI Gateway mock provider!",
    );
  });
});
