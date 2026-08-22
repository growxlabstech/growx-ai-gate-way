import { describe, expect, it } from "vitest";
import { Decimal } from "@growx/money";
import {
  CreditExpirationWorker,
  CreditService,
  InMemoryCreditRepository,
  ReconciliationWorker,
  SettlementWorker,
  StaleReservationWorker,
} from "../src/index.js";

describe("Credit & Wallet Service", () => {
  function setupTest() {
    const repo = new InMemoryCreditRepository();
    const service = new CreditService(repo);
    const expirationWorker = new CreditExpirationWorker(repo);
    const staleWorker = new StaleReservationWorker(repo, service);
    const settlementWorker = new SettlementWorker(service);
    const reconciliationWorker = new ReconciliationWorker(repo, service);
    return {
      repo,
      service,
      expirationWorker,
      staleWorker,
      settlementWorker,
      reconciliationWorker,
    };
  }

  it("creates a wallet and grants credits idempotently", async () => {
    const { service } = setupTest();

    const grant1 = await service.grantCredits({
      organizationId: "org_1",
      amount: "100.00",
      lotType: "purchased",
      sourceType: "order",
      sourceId: "ord_1",
      idempotencyKey: "idem_grant_1",
    });

    expect(grant1.lot.remainingAmount.toString()).toBe("100");
    expect(grant1.balance.available.toString()).toBe("100");
    expect(grant1.balance.total.toString()).toBe("100");

    // Idempotent retry
    const grant2 = await service.grantCredits({
      organizationId: "org_1",
      amount: "100.00",
      lotType: "purchased",
      sourceType: "order",
      sourceId: "ord_1",
      idempotencyKey: "idem_grant_1",
    });

    expect(grant2.lot.id).toBe(grant1.lot.id);
    expect(grant2.balance.available.toString()).toBe("100");
  });

  it("authorizes billing and reserves credits", async () => {
    const { service } = setupTest();

    await service.grantCredits({
      organizationId: "org_1",
      amount: "50.00",
      sourceType: "grant",
      sourceId: "g_1",
    });

    const auth = await service.authorizeBilling({
      requestId: "req_1",
      organizationId: "org_1",
      workspaceId: "ws_1",
      estimatedPrice: "10.00",
    });

    expect(auth.authorized).toBe(true);
    expect(auth.decision).toBe("AUTHORIZED");
    expect(auth.reservedAmount.toString()).toBe("10");
    expect(auth.availableBalance?.toString()).toBe("40");

    const balance = await service.getWalletBalance(
      (await service.getOrCreateWallet("org_1")).id,
    );
    expect(balance.available.toString()).toBe("40");
    expect(balance.reserved.toString()).toBe("10");
    expect(balance.total.toString()).toBe("50");
  });

  it("handles zero-cost request authorization without reservation", async () => {
    const { service } = setupTest();

    const auth = await service.authorizeBilling({
      requestId: "req_free",
      organizationId: "org_free",
      workspaceId: "ws_1",
      estimatedPrice: "0.00",
    });

    expect(auth.authorized).toBe(true);
    expect(auth.decision).toBe("AUTHORIZED");
    expect(auth.reservedAmount.toString()).toBe("0");
  });

  it("fails closed on insufficient credits", async () => {
    const { service } = setupTest();

    await service.grantCredits({
      organizationId: "org_low",
      amount: "5.00",
      sourceType: "grant",
      sourceId: "g_low",
    });

    const auth = await service.authorizeBilling({
      requestId: "req_too_much",
      organizationId: "org_low",
      workspaceId: "ws_1",
      estimatedPrice: "20.00",
    });

    expect(auth.authorized).toBe(false);
    expect(auth.decision).toBe("INSUFFICIENT_CREDITS");
    expect(auth.reason).toContain("Insufficient credits");
  });

  it("fails closed when wallet is frozen", async () => {
    const { service } = setupTest();

    const wallet = await service.getOrCreateWallet("org_frozen");
    await service.grantCredits({
      organizationId: "org_frozen",
      amount: "100.00",
      sourceType: "grant",
      sourceId: "g_1",
    });

    await service.freezeWallet(wallet.id);

    const auth = await service.authorizeBilling({
      requestId: "req_frozen",
      organizationId: "org_frozen",
      workspaceId: "ws_1",
      estimatedPrice: "10.00",
    });

    expect(auth.authorized).toBe(false);
    expect(auth.decision).toBe("WALLET_FROZEN");
  });

  it("enforces workspace budget limit", async () => {
    const { service } = setupTest();

    await service.grantCredits({
      organizationId: "org_budget",
      amount: "500.00",
      sourceType: "grant",
      sourceId: "g_1",
    });

    await service.setWorkspaceBudget({
      id: "bud_1",
      organizationId: "org_budget",
      workspaceId: "ws_budget",
      currency: "USD",
      period: "monthly",
      hardLimit: new Decimal("20.00"),
      spentInPeriod: Decimal.ZERO,
      reservedInPeriod: Decimal.ZERO,
      periodStart: new Date(),
      periodEnd: new Date(Date.now() + 86400000 * 30),
      enabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const auth = await service.authorizeBilling({
      requestId: "req_overbudget",
      organizationId: "org_budget",
      workspaceId: "ws_budget",
      estimatedPrice: "25.00",
    });

    expect(auth.authorized).toBe(false);
    expect(auth.decision).toBe("BUDGET_EXCEEDED");
  });

  it("settles reservation when actual cost is less than reserved (releasing remainder)", async () => {
    const { service } = setupTest();

    await service.grantCredits({
      organizationId: "org_settle",
      amount: "100.00",
      sourceType: "grant",
      sourceId: "g_1",
    });

    const auth = await service.authorizeBilling({
      requestId: "req_settle",
      organizationId: "org_settle",
      workspaceId: "ws_1",
      estimatedPrice: "20.00",
    });

    // Actual usage cost is only 12.50
    const settle = await service.settleReservation({
      reservationId: auth.reservationId!,
      finalCustomerPrice: "12.50",
    });

    expect(settle.status).toBe("settled");
    expect(settle.consumedAmount.toString()).toBe("12.5");
    expect(settle.releasedAmount.toString()).toBe("7.5");

    const wallet = await service.getOrCreateWallet("org_settle");
    const balance = await service.getWalletBalance(wallet.id);

    // Total: 100 - 12.50 = 87.50
    // Reserved: 0
    // Available: 87.50
    expect(balance.total.toString()).toBe("87.5");
    expect(balance.reserved.toString()).toBe("0");
    expect(balance.available.toString()).toBe("87.5");
  });

  it("settles reservation when actual cost exceeds reservation (overage covered by balance)", async () => {
    const { service } = setupTest();

    await service.grantCredits({
      organizationId: "org_overage",
      amount: "100.00",
      sourceType: "grant",
      sourceId: "g_1",
    });

    const auth = await service.authorizeBilling({
      requestId: "req_overage",
      organizationId: "org_overage",
      workspaceId: "ws_1",
      estimatedPrice: "20.00",
    });

    // Final price is 25.00 (5.00 overage)
    const settle = await service.settleReservation({
      reservationId: auth.reservationId!,
      finalCustomerPrice: "25.00",
    });

    expect(settle.status).toBe("settled");
    expect(settle.consumedAmount.toString()).toBe("25");
    expect(settle.overageAmount.toString()).toBe("5");

    const wallet = await service.getOrCreateWallet("org_overage");
    const balance = await service.getWalletBalance(wallet.id);

    // Total: 100 - 25 = 75
    // Reserved: 0
    // Available: 75
    expect(balance.total.toString()).toBe("75");
    expect(balance.available.toString()).toBe("75");
  });

  it("settles reservation with controlled shortfall when balance cannot cover overage", async () => {
    const { service } = setupTest();

    await service.grantCredits({
      organizationId: "org_short",
      amount: "20.00",
      sourceType: "grant",
      sourceId: "g_1",
    });

    const auth = await service.authorizeBilling({
      requestId: "req_short",
      organizationId: "org_short",
      workspaceId: "ws_1",
      estimatedPrice: "20.00",
    });

    // Final price is 30.00 (shortfall of 10.00)
    const settle = await service.settleReservation({
      reservationId: auth.reservationId!,
      finalCustomerPrice: "30.00",
    });

    expect(settle.status).toBe("shortfall");
    expect(settle.consumedAmount.toString()).toBe("20");
    expect(settle.shortfallAmount.toString()).toBe("10");

    const wallet = await service.getOrCreateWallet("org_short");
    const balance = await service.getWalletBalance(wallet.id);

    expect(balance.total.toString()).toBe("0");
    expect(balance.available.toString()).toBe("0");
  });

  it("releases unconsumed reservation on execution error", async () => {
    const { service } = setupTest();

    await service.grantCredits({
      organizationId: "org_rel",
      amount: "50.00",
      sourceType: "grant",
      sourceId: "g_1",
    });

    const auth = await service.authorizeBilling({
      requestId: "req_rel",
      organizationId: "org_rel",
      workspaceId: "ws_1",
      estimatedPrice: "15.00",
    });

    const rel = await service.releaseReservation({
      reservationId: auth.reservationId!,
      reason: "provider_error",
    });

    expect(rel.status).toBe("released");

    const wallet = await service.getOrCreateWallet("org_rel");
    const balance = await service.getWalletBalance(wallet.id);

    expect(balance.total.toString()).toBe("50");
    expect(balance.reserved.toString()).toBe("0");
    expect(balance.available.toString()).toBe("50");
  });

  it("sweeps expired credit lots via CreditExpirationWorker", async () => {
    const { service, expirationWorker } = setupTest();

    await service.grantCredits({
      organizationId: "org_exp",
      amount: "30.00",
      lotType: "promotional",
      expiresAt: new Date("2026-02-01T00:00:00Z"),
      sourceType: "promo",
      sourceId: "p_1",
    });

    await service.grantCredits({
      organizationId: "org_exp",
      amount: "70.00",
      lotType: "purchased",
      expiresAt: null,
      sourceType: "order",
      sourceId: "o_1",
    });

    const run = await expirationWorker.processExpiredLots(
      new Date("2026-03-01T00:00:00Z"),
    );
    expect(run.totalExpiredCredits.toString()).toBe("30");
    expect(run.expiredLotIds.length).toBe(1);

    const wallet = await service.getOrCreateWallet("org_exp");
    const balance = await service.getWalletBalance(wallet.id);

    expect(balance.total.toString()).toBe("70");
    expect(balance.available.toString()).toBe("70");
  });

  it("reconciles wallet balance from immutable ledger", async () => {
    const { service, reconciliationWorker } = setupTest();

    await service.grantCredits({
      organizationId: "org_recon",
      amount: "100.00",
      sourceType: "grant",
      sourceId: "g_1",
    });

    const auth = await service.authorizeBilling({
      requestId: "req_rec",
      organizationId: "org_recon",
      workspaceId: "ws_1",
      estimatedPrice: "20.00",
    });

    await service.settleReservation({
      reservationId: auth.reservationId!,
      finalCustomerPrice: "15.00",
    });

    const wallet = await service.getOrCreateWallet("org_recon");
    const report = await reconciliationWorker.reconcileWallet(wallet.id);

    expect(report.reconciled).toBe(true);
    expect(report.discrepancies.length).toBe(0);
  });
});
