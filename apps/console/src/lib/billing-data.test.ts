import { describe, expect, it } from "vitest";
import {
  createCheckoutSession,
  loadWorkspaceBillingSummary,
  verifyCheckoutStatus,
} from "./billing-data";

describe("D8 Billing, Credits & Checkout Data Layer", () => {
  it("loads authoritative workspace wallet details, spend, and auto-topup settings", async () => {
    const summary = await loadWorkspaceBillingSummary({
      organizationId: "org_northstar",
      workspaceId: "ws_production",
      organizationSlug: "northstar",
      workspaceSlug: "production",
    });

    expect(summary.wallet.walletId).toBe("wal_northstar_prod");
    expect(summary.wallet.availableBalance).toBe(450.0);
    expect(summary.wallet.availableBalanceFormatted).toBe("$450.00");
    expect(summary.wallet.reservedBalance).toBe(15.0);
    expect(summary.wallet.totalBalanceFormatted).toBe("$465.00");
    expect(summary.wallet.currentSpendFormatted).toBe("$50.00");
    expect(summary.wallet.autoTopupEnabled).toBe(true);
    expect(summary.wallet.autoTopupAmount).toBe(200.0);
  });

  it("loads commercial plan and Phase-18 entitlement rate limits", async () => {
    const summary = await loadWorkspaceBillingSummary({
      organizationId: "org_northstar",
      workspaceId: "ws_production",
      organizationSlug: "northstar",
      workspaceSlug: "production",
    });

    expect(summary.subscription.planId).toBe("plan_scale_enterprise");
    expect(summary.subscription.planName).toBe("Scale Enterprise");
    expect(summary.subscription.status).toBe("active");
    expect(summary.subscription.rateLimits.rpm).toBe(3000);
    expect(summary.subscription.rateLimits.maxConcurrency).toBe(100);
    expect(summary.subscription.features).toContain("Dedicated Rate Limits");
  });

  it("loads canonical transaction history with ledger entries and resulting balances", async () => {
    const summary = await loadWorkspaceBillingSummary({
      organizationId: "org_northstar",
      workspaceId: "ws_production",
      organizationSlug: "northstar",
      workspaceSlug: "production",
    });

    expect(summary.transactions.length).toBeGreaterThanOrEqual(3);
    const firstTx = summary.transactions[0];
    expect(firstTx.type).toBe("credit_purchase");
    expect(firstTx.direction).toBe("credit");
    expect(firstTx.amount).toBe(200.0);
    expect(firstTx.amountFormatted).toBe("+$200.00");
    expect(firstTx.resultingBalanceFormatted).toBe("$450.00");
  });

  it("loads authoritative tax invoices with invoice numbers and download links", async () => {
    const summary = await loadWorkspaceBillingSummary({
      organizationId: "org_northstar",
      workspaceId: "ws_production",
      organizationSlug: "northstar",
      workspaceSlug: "production",
    });

    expect(summary.invoices.length).toBeGreaterThanOrEqual(2);
    const firstInv = summary.invoices[0];
    expect(firstInv.invoiceNumber).toBe("INV-2026-0081");
    expect(firstInv.status).toBe("paid");
    expect(firstInv.totalFormatted).toBe("$200.00");
    expect(firstInv.pdfDownloadUrl).toContain("inv_northstar_01");
  });

  it("creates real CheckoutSession with order summary and dynamic UPI QR payload", async () => {
    const session = await createCheckoutSession({
      organizationId: "org_northstar",
      workspaceId: "ws_production",
      packageId: "pkg_250",
      currency: "USD",
    });

    expect(session.checkoutSessionId).toMatch(/^cs_/);
    expect(session.orderId).toMatch(/^ord_/);
    expect(session.amount).toBe(250.0);
    expect(session.totalAmountFormatted).toBe("$250.00");
    expect(session.availableMethods.length).toBe(3);
    expect(session.upiDetails?.vpa).toBe("growxlabs@icici");
    expect(session.upiDetails?.qrPayload).toContain("am=250.00");
  });

  it("verifies server-side payment completion without trusting client query params", async () => {
    const verification = await verifyCheckoutStatus({
      organizationId: "org_northstar",
      workspaceId: "ws_production",
      checkoutSessionId: "cs_test_session_01",
    });

    expect(verification.status).toBe("succeeded");
    expect(verification.message).toContain("GrowX Payment Engine");
  });

  it("enforces strict multi-tenant financial isolation between Northstar and Orbit", async () => {
    const orbitSummary = await loadWorkspaceBillingSummary({
      organizationId: "org_orbit",
      workspaceId: "ws_orbit",
      organizationSlug: "orbit",
      workspaceSlug: "core",
    });

    expect(orbitSummary.wallet.walletId).toBe("wal_orbit_core");
    expect(orbitSummary.wallet.availableBalance).toBe(120.0);
    expect(orbitSummary.wallet.availableBalanceFormatted).toBe("$120.00");
    expect(orbitSummary.subscription.planId).toBe("plan_developer");
    expect(orbitSummary.transactions[0].id).toBe("tx_orbit_01");
    expect(orbitSummary.invoices[0].invoiceNumber).toBe("INV-2026-0042");

    // Orbit should not have Northstar's transactions or $450 balance
    expect(orbitSummary.wallet.availableBalance).not.toBe(450.0);
  });
});
