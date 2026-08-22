import { test, expect } from "@playwright/test";

test.describe("D8 Billing, Credits, Checkout & Invoices E2E", () => {
  test.beforeEach(async ({ context }) => {
    await context.addCookies([
      {
        name: "gx_fixture",
        value: "tenant-a",
        domain: "127.0.0.1",
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
  });

  test("displays authoritative billing dashboard with wallet balance, spend, plan, and transactions", async ({
    page,
  }) => {
    await page.goto("/northstar/production/billing");
    await expect(page.locator("h1")).toHaveText("Billing & Credits", {
      timeout: 30_000,
    });

    // 1. Metric Cards
    const cards = page.locator(".billing-metric-card");
    await expect(cards.first()).toBeVisible({ timeout: 15_000 });

    // Balance card
    await expect(cards.nth(0)).toContainText("$450.00");
    await expect(cards.nth(0)).toContainText("ACTIVE");
    await expect(cards.nth(0)).toContainText("Reserved: $15.00");
    await expect(cards.nth(0)).toContainText("Total: $465.00");

    // Spend card
    await expect(cards.nth(1)).toContainText("$50.00");
    await expect(cards.nth(1)).toContainText("Auto-Topup ON");

    // Plan card
    await expect(cards.nth(2)).toContainText("Scale Enterprise");
    await expect(cards.nth(2)).toContainText("3000 RPM");
    await expect(cards.nth(2)).toContainText("100 Concurrency");

    // 2. Transactions Table
    await expect(page.locator(".data-table")).toBeVisible();
    await expect(
      page.getByText("Prepaid Credit Top-up (Checkout cs_01jq8a9x)"),
    ).toBeVisible();
    await expect(page.getByText("+$200.00")).toBeVisible();
    await expect(
      page.getByText("Daily Gateway Inference Settlement"),
    ).toBeVisible();
    await expect(page.getByText("-$50.00")).toBeVisible();

    // 3. Switch to Invoices Tab
    await page.getByRole("tab", { name: /Invoices/ }).click();
    await expect(page.getByText("INV-2026-0081")).toBeVisible();
    await expect(page.getByText("INV-2026-0065")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Download PDF ↓" }).first(),
    ).toBeVisible();

    // 4. Switch to Billing Profile Tab
    await page.getByRole("tab", { name: /Billing Profile & Tax/ }).click();
    await expect(page.getByText("Northstar Technologies LLC")).toBeVisible();
    await expect(page.getByText("billing@northstar.example.com")).toBeVisible();
    await expect(page.getByText("EIN: US123456789")).toBeVisible();

    // 5. Switch to Plan & Entitlements Tab
    await page.getByRole("tab", { name: /Plan & Entitlements/ }).click();
    await expect(
      page.locator(".plan-title:has-text('Scale Enterprise')"),
    ).toBeVisible();
    await expect(page.getByText("3000 RPM")).toBeVisible();
    await expect(page.getByText("Dedicated Rate Limits")).toBeVisible();
  });

  test("executes complete GrowX-owned checkout flow with package selection, UPI QR, and server verification", async ({
    page,
  }) => {
    await page.goto("/northstar/production/billing");
    await expect(page.locator("h1")).toHaveText("Billing & Credits", {
      timeout: 30_000,
    });

    // Verify initial balance
    await expect(page.locator(".billing-metric-card").first()).toContainText(
      "$450.00",
    );

    // 1. Open Add Credits Dialog
    await page.getByRole("button", { name: "+ Add Credits" }).click();
    const dialog = page.locator(".checkout-modal-card");
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByText("Add Credits to Workspace Wallet"),
    ).toBeVisible();

    // 2. Select $250 package
    await dialog
      .getByRole("radio", { name: "$250 +$25 Bonus USD Credits" })
      .click();
    await dialog
      .getByRole("button", { name: "Continue to Checkout →" })
      .click();

    // 3. Checkout Screen & Order Summary
    await expect(dialog.getByText("GrowX Secure Checkout")).toBeVisible();
    await expect(dialog.getByText("Order Total")).toBeVisible();
    await expect(dialog.locator(".order-summary-val")).toHaveText("$250.00");
    await expect(dialog.getByText(/Expires in/)).toBeVisible();

    // 4. Payment Method Selection (UPI by default)
    await expect(dialog.getByText("Scan QR with any UPI app")).toBeVisible();
    await expect(dialog.locator(".qr-box-simulated")).toBeVisible();

    // Copy VPA
    const copyVpaBtn = dialog.locator(".vpa-copy-row .btn-copy-mini");
    await copyVpaBtn.click();
    await expect(copyVpaBtn).toHaveText("Copied ✓");

    // Switch to Card
    await dialog.getByRole("radio", { name: /Credit \/ Debit Card/ }).click();
    await expect(dialog.getByText("Card Number")).toBeVisible();

    // Switch back to UPI
    await dialog.getByRole("radio", { name: /UPI \/ Dynamic QR/ }).click();

    // 5. Authorize and Complete Payment
    await dialog.getByRole("button", { name: "Pay $250.00" }).click();

    // 6. Verification & Success confirmation
    await expect(
      dialog.getByText("Credits Successfully Activated"),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      dialog.getByText(
        "$250.00 in GrowX AI credits have been credited to your workspace wallet.",
      ),
    ).toBeVisible();
    await expect(dialog.getByText("SETTLED & ACTIVE")).toBeVisible();

    // 7. Close dialog & verify instant balance update
    await dialog.getByRole("button", { name: "Done" }).click();
    await expect(dialog).not.toBeVisible();

    // Balance should now reflect $450 + $250 = $700.00
    await expect(page.locator(".billing-metric-card").first()).toContainText(
      "$700.00",
    );
    // New transaction should be in table
    await expect(page.locator(".data-table")).toContainText("+$250.00");
  });

  test("downloads authentic PDF tax invoice document", async ({ page }) => {
    await page.goto("/northstar/production/billing");
    await page.getByRole("tab", { name: /Invoices/ }).click();

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download PDF ↓" }).first().click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/INV-2026-0081\.pdf/);
  });

  test("isolates multi-tenant financial data between Northstar and Orbit workspaces", async ({
    context,
    page,
  }) => {
    // 1. Check Northstar Production Billing
    await page.goto("/northstar/production/billing");
    await expect(page.locator(".billing-metric-card").first()).toContainText(
      "$450.00",
      { timeout: 30_000 },
    );
    await page.getByRole("tab", { name: /Billing Profile & Tax/ }).click();
    await expect(page.getByText("Northstar Technologies LLC")).toBeVisible();

    // 2. Switch to Orbit Core Workspace (Tenant B)
    await context.addCookies([
      {
        name: "gx_fixture",
        value: "tenant-b",
        domain: "127.0.0.1",
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);

    await page.goto("/orbit/core/billing");
    await expect(page.locator(".billing-metric-card").first()).toContainText(
      "$120.00",
      { timeout: 30_000 },
    );
    await expect(page.getByText("Developer Sandbox").first()).toBeVisible();
    await page.getByRole("tab", { name: /Billing Profile & Tax/ }).click();
    await expect(page.getByText("Orbit Intelligence Inc.")).toBeVisible();
    await page.getByRole("tab", { name: /Invoices/ }).click();
    await expect(page.getByText("INV-2026-0042")).toBeVisible();

    // Must not show Northstar's invoices or balance
    await expect(
      page.locator(".billing-metric-card").first(),
    ).not.toContainText("$450.00");
    await expect(page.getByText("INV-2026-0081")).not.toBeVisible();
  });

  test("navigates seamlessly from Overview (D4) to Billing (D8)", async ({
    page,
  }) => {
    await page.goto("/northstar/production/overview");
    await expect(page.locator("h1")).toHaveText("Workspace overview", {
      timeout: 30_000,
    });

    // Click "Billing" link on the balance card
    await page
      .getByRole("link", { name: "Manage credits and billing" })
      .click();
    await expect(page).toHaveURL(/\/northstar\/production\/billing/);
    await expect(page.locator("h1")).toHaveText("Billing & Credits");
  });
});
