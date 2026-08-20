import { describe, expect, it, beforeEach } from "vitest";
import { createTestGatewayFixture, type TestGatewayFixture } from "../helpers/test-fixture.js";
import {
  CreditService,
  InMemoryCreditRepository,
} from "@growx/credit-service";
import {
  CustomerPriceCalculator,
  CustomerPricingResolver,
} from "@growx/pricing";
import { Decimal } from "@growx/money";

describe("Phase 17 — Billing Pre-Authorization & Credit Settlement Gateway Integration", () => {
  let fixture: TestGatewayFixture;
  let creditService: CreditService;
  let creditRepo: InMemoryCreditRepository;

  beforeEach(async () => {
    fixture = await createTestGatewayFixture();
    creditRepo = new InMemoryCreditRepository();
    creditService = new CreditService(creditRepo);

    // Replace the creditService and customerPriceCalculator on the fixture's gatewayEngine
    (fixture.gatewayEngine as any).creditService = creditService;
    (fixture.gatewayEngine as any).customerPriceCalculator = new CustomerPriceCalculator(
      new CustomerPricingResolver()
    );
    (fixture.gatewayEngine as any).billingEnabled = true;
  });

  it("authorizes, reserves credits, executes request, and settles reservation based on actual usage", async () => {
    const { record: apiKey } = await fixture.createTestApiKey({
      organizationId: "org_billing_test",
      workspaceId: "ws_billing_test",
    });

    const auth = {
      apiKeyId: apiKey.id,
      organizationId: apiKey.organizationId,
      workspaceId: apiKey.workspaceId,
      environmentId: apiKey.environmentId,
      environment: apiKey.environment,
      role: apiKey.role,
      permissions: apiKey.permissions,
      rateLimits: apiKey.rateLimits,
      modelRules: apiKey.modelRules,
      ipAllowlist: apiKey.ipAllowlist,
      status: apiKey.status,
    };

    // Grant $100.00 credits
    await creditService.grantCredits({
      organizationId: apiKey.organizationId,
      amount: "100.00",
      lotType: "purchased",
      sourceType: "order",
      sourceId: "ord_100",
    });

    const response = await fixture.gatewayEngine.executeChatCompletion(auth as any, {
      model: "openai/gpt-4o-mini",
      messages: [{ role: "user", content: "Hello world" }],
    } as any);

    expect(response.choices[0]?.message.content).toBe("Hello from GrowX AI Gateway mock provider!");

    const wallet = await creditService.getOrCreateWallet(apiKey.organizationId);
    const balance = await creditService.getWalletBalance(wallet.id);

    // Reserved balance must be 0 after settlement
    expect(balance.reserved.toString()).toBe("0");
    // Total & Available balance must be decreased by settled amount (less than 100)
    expect(balance.total.lt(new Decimal("100.00"))).toBe(true);
    expect(balance.available.eq(balance.total)).toBe(true);
  });

  it("fails closed with 402 INSUFFICIENT_CREDITS when wallet has 0 credits", async () => {
    const { record: apiKey } = await fixture.createTestApiKey({
      organizationId: "org_billing_zero",
      workspaceId: "ws_billing_zero",
    });

    const auth = {
      apiKeyId: apiKey.id,
      organizationId: apiKey.organizationId,
      workspaceId: apiKey.workspaceId,
      environmentId: apiKey.environmentId,
      environment: apiKey.environment,
      role: apiKey.role,
      permissions: apiKey.permissions,
      rateLimits: apiKey.rateLimits,
      modelRules: apiKey.modelRules,
      ipAllowlist: apiKey.ipAllowlist,
      status: apiKey.status,
    };

    await expect(
      fixture.gatewayEngine.executeChatCompletion(auth as any, {
        model: "openai/gpt-4o-mini",
        messages: [{ role: "user", content: "Hello without money" }],
      } as any)
    ).rejects.toMatchObject({
      status: 402,
      code: "insufficient_credits",
    });
  });

  it("fails closed with 403 WALLET_FROZEN when wallet is frozen", async () => {
    const { record: apiKey } = await fixture.createTestApiKey({
      organizationId: "org_billing_frozen",
      workspaceId: "ws_billing_frozen",
    });

    const auth = {
      apiKeyId: apiKey.id,
      organizationId: apiKey.organizationId,
      workspaceId: apiKey.workspaceId,
      environmentId: apiKey.environmentId,
      environment: apiKey.environment,
      role: apiKey.role,
      permissions: apiKey.permissions,
      rateLimits: apiKey.rateLimits,
      modelRules: apiKey.modelRules,
      ipAllowlist: apiKey.ipAllowlist,
      status: apiKey.status,
    };

    // Grant credits but freeze wallet
    await creditService.grantCredits({
      organizationId: apiKey.organizationId,
      amount: "50.00",
      sourceType: "grant",
      sourceId: "g_1",
    });

    const wallet = await creditService.getOrCreateWallet(apiKey.organizationId);
    await creditService.freezeWallet(wallet.id);

    await expect(
      fixture.gatewayEngine.executeChatCompletion(auth as any, {
        model: "openai/gpt-4o-mini",
        messages: [{ role: "user", content: "Hello frozen" }],
      } as any)
    ).rejects.toMatchObject({
      status: 403,
      code: "wallet_frozen",
    });
  });

  it("fails closed with 402 BUDGET_EXCEEDED when workspace budget limit is exceeded", async () => {
    const { record: apiKey } = await fixture.createTestApiKey({
      organizationId: "org_billing_budget",
      workspaceId: "ws_billing_budget",
    });

    const auth = {
      apiKeyId: apiKey.id,
      organizationId: apiKey.organizationId,
      workspaceId: apiKey.workspaceId,
      environmentId: apiKey.environmentId,
      environment: apiKey.environment,
      role: apiKey.role,
      permissions: apiKey.permissions,
      rateLimits: apiKey.rateLimits,
      modelRules: apiKey.modelRules,
      ipAllowlist: apiKey.ipAllowlist,
      status: apiKey.status,
    };

    await creditService.grantCredits({
      organizationId: apiKey.organizationId,
      amount: "500.00",
      sourceType: "grant",
      sourceId: "g_1",
    });

    // Set budget limit to $0.00000001 (exceeded by any request)
    await creditService.setWorkspaceBudget({
      id: "bud_low",
      organizationId: apiKey.organizationId,
      workspaceId: apiKey.workspaceId,
      currency: "USD",
      period: "monthly",
      hardLimit: new Decimal("0.00000001"),
      spentInPeriod: Decimal.ZERO,
      reservedInPeriod: Decimal.ZERO,
      periodStart: new Date(),
      periodEnd: new Date(Date.now() + 86400000 * 30),
      enabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(
      fixture.gatewayEngine.executeChatCompletion(auth as any, {
        model: "openai/gpt-4o-mini",
        messages: [{ role: "user", content: "Hello budget" }],
      } as any)
    ).rejects.toMatchObject({
      status: 402,
      code: "budget_exceeded",
    });
  });

  it("releases reserved credits back to available balance when provider execution fails", async () => {
    const { record: apiKey } = await fixture.createTestApiKey({
      organizationId: "org_billing_fail",
      workspaceId: "ws_billing_fail",
    });

    const auth = {
      apiKeyId: apiKey.id,
      organizationId: apiKey.organizationId,
      workspaceId: apiKey.workspaceId,
      environmentId: apiKey.environmentId,
      environment: apiKey.environment,
      role: apiKey.role,
      permissions: apiKey.permissions,
      rateLimits: apiKey.rateLimits,
      modelRules: apiKey.modelRules,
      ipAllowlist: apiKey.ipAllowlist,
      status: apiKey.status,
    };

    await creditService.grantCredits({
      organizationId: apiKey.organizationId,
      amount: "50.00",
      sourceType: "grant",
      sourceId: "g_1",
    });

    // Force mock adapter to throw error
    fixture.mockAdapter.executeMock = async () => {
      throw new Error("Provider explosion 500");
    };

    await expect(
      fixture.gatewayEngine.executeChatCompletion(auth as any, {
        model: "openai/gpt-4o-mini",
        messages: [{ role: "user", content: "Will fail" }],
      } as any)
    ).rejects.toThrow();

    const wallet = await creditService.getOrCreateWallet(apiKey.organizationId);
    const balance = await creditService.getWalletBalance(wallet.id);

    // Reservation should be released -> available is back to $50.00, reserved is 0
    expect(balance.reserved.toString()).toBe("0");
    expect(balance.available.toString()).toBe("50");
    expect(balance.total.toString()).toBe("50");
  });

  it("reserves credits for streaming chat completion and settles after stream finishes", async () => {
    const { record: apiKey } = await fixture.createTestApiKey({
      organizationId: "org_billing_stream",
      workspaceId: "ws_billing_stream",
    });

    const auth = {
      apiKeyId: apiKey.id,
      organizationId: apiKey.organizationId,
      workspaceId: apiKey.workspaceId,
      environmentId: apiKey.environmentId,
      environment: apiKey.environment,
      role: apiKey.role,
      permissions: apiKey.permissions,
      rateLimits: apiKey.rateLimits,
      modelRules: apiKey.modelRules,
      ipAllowlist: apiKey.ipAllowlist,
      status: apiKey.status,
    };

    await creditService.grantCredits({
      organizationId: apiKey.organizationId,
      amount: "80.00",
      sourceType: "grant",
      sourceId: "g_stream",
    });

    const chunks: any[] = [];
    for await (const chunk of fixture.gatewayEngine.streamChatCompletion(auth as any, {
      model: "openai/gpt-4o-mini",
      messages: [{ role: "user", content: "Stream me" }],
    } as any)) {
      chunks.push(chunk);
    }

    expect(chunks.length).toBeGreaterThan(0);

    const wallet = await creditService.getOrCreateWallet(apiKey.organizationId);
    const balance = await creditService.getWalletBalance(wallet.id);

    expect(balance.reserved.toString()).toBe("0");
    expect(balance.total.lt(new Decimal("80.00"))).toBe(true);
    expect(balance.available.eq(balance.total)).toBe(true);
  });
});
