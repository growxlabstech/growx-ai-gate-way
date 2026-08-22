import { expect, test } from "@playwright/test";

test.describe("D9 GrowX Operator Admin & Control Plane E2E", () => {
  test.beforeEach(async ({ context }) => {
    await context.addCookies([
      {
        name: "gx_fixture",
        value: "tenant-a",
        domain: "localhost",
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
  });
  test("displays high-signal platform operations overview with live incidents, providers, and audit stream", async ({
    page,
  }) => {
    await page.goto("/admin");
    await expect(page.locator("h1")).toHaveText(
      "Platform Operations Overview",
      { timeout: 30_000 },
    );

    // KPI cards
    const kpiCards = page.locator(".admin-kpi-card");
    await expect(kpiCards.first()).toBeVisible();
    await expect(
      page.locator(".kpi-label:has-text('Active Incidents')"),
    ).toBeVisible();
    await expect(
      page.locator(".kpi-label:has-text('Degraded Providers')"),
    ).toBeVisible();
    await expect(
      page.locator(".kpi-label:has-text('Worker Pools')"),
    ).toBeVisible();
    await expect(
      page.locator(".kpi-label:has-text('Reconciliation')"),
    ).toBeVisible();

    // Active incident card
    await expect(
      page.getByText("🚨 Active Incident Investigations"),
    ).toBeVisible();
    await expect(
      page.getByText("Mistral AI upstream rate-limiting elevation"),
    ).toBeVisible();

    // Providers table & Audit stream
    await expect(page.getByText("OpenAI Platform")).toBeVisible();
    await expect(page.getByText("Tamper-Evident Audit Stream")).toBeVisible();
  });

  test("manages global users, searches by email, and toggles user suspension", async ({
    page,
  }) => {
    await page.goto("/admin/users");
    await expect(page.locator("h1")).toHaveText("Global User Management", {
      timeout: 30_000,
    });

    // User table
    await expect(page.getByText("Alex Thorne")).toBeVisible();
    await expect(page.getByText("alex@northstar.example.com")).toBeVisible();
    await expect(page.getByText("MFA ON").first()).toBeVisible();

    // Search filter
    const searchInput = page.locator("input[type='search']");
    await searchInput.fill("abusive_bot");
    await expect(page.getByText("Abuse Test Bot")).toBeVisible();
    await expect(page.getByText("Alex Thorne")).not.toBeVisible();

    // Reactivate suspended user
    page.on("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Reactivate" }).click();
    await expect(
      page.getByText(/User abusive_bot@external.test has been reactivated/),
    ).toBeVisible();
  });

  test("inspects upstream AI providers, toggles drain mode, and rotates credentials with write-only vault", async ({
    page,
  }) => {
    await page.goto("/admin/providers");
    await expect(page.locator("h1")).toHaveText("Upstream AI Providers", {
      timeout: 30_000,
    });

    // Provider table
    await expect(page.getByText("OpenAI Platform")).toBeVisible();
    await expect(page.getByText("Anthropic Claude API")).toBeVisible();
    await expect(page.getByText("Groq LPU Inference")).toBeVisible();

    // Toggle Drain mode
    page.on("dialog", (dialog) => dialog.accept());
    const drainBtn = page.getByRole("button", { name: "Drain" }).first();
    await drainBtn.click();
    await expect(page.getByText(/drain mode set to ENABLED/)).toBeVisible();

    // Open Rotate Key modal
    await page.getByRole("button", { name: "Rotate Key" }).first().click();
    const modal = page.locator(".dialog-card");
    await expect(modal).toBeVisible();
    await expect(
      modal.getByText("Rotate OpenAI Platform Credential"),
    ).toBeVisible();

    // Fill new write-only key
    await modal
      .locator("#new-key-input")
      .fill("sk-test-rot-key-1234567890abcdef");
    await modal.getByRole("button", { name: "Save & Activate Key" }).click();

    // Verify confirmation and zero secret exposure
    await expect(modal).not.toBeVisible();
    await expect(
      page.getByText(/rotated and envelope-encrypted in Secret Vault/),
    ).toBeVisible();
    await expect(page.locator("body")).not.toContainText(
      "sk-test-rot-key-1234567890abcdef",
    );
  });

  test("manages Model Registry and toggles model disable kill switch", async ({
    page,
  }) => {
    await page.goto("/admin/models");
    await expect(page.locator("h1")).toHaveText(
      "Model Registry Administration",
      { timeout: 30_000 },
    );

    // Model table
    await expect(page.getByText("GPT-4o Omnimodal")).toBeVisible();
    await expect(page.getByText("Claude 3.5 Sonnet")).toBeVisible();
    await expect(page.getByText("GrowX Intelligent Fast")).toBeVisible();

    // Disable model via emergency kill switch
    page.on("dialog", (dialog) => dialog.accept());
    const disableBtn = page.getByRole("button", { name: "Disable" }).first();
    await disableBtn.click();
    await expect(page.getByText(/status updated to DISABLED/)).toBeVisible();
  });

  test("inspects tamper-evident immutable audit events with SHA-256 hash chains", async ({
    page,
  }) => {
    await page.goto("/admin/audit-events");
    await expect(page.locator("h1")).toHaveText(
      "Append-Only Immutable Audit Log",
      { timeout: 30_000 },
    );

    // Audit entries
    await expect(page.getByText("provider.drain.enable")).toBeVisible();
    await expect(page.getByText("model.status.disable")).toBeVisible();
    await expect(page.getByText("wallet.ledger.adjustment")).toBeVisible();
    await expect(page.getByText("SUCCESS").first()).toBeVisible();

    // Verify hash chains
    await expect(page.getByText(/sha256:/).first()).toBeVisible();

    // Verify zero edit or delete controls exist
    await expect(page.getByRole("button", { name: /Edit/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Delete/i })).toHaveCount(0);
  });

  test("inspects security events and automated signals", async ({ page }) => {
    await page.goto("/admin/security-events");
    await expect(page.locator("h1")).toHaveText(
      "Security Operations & Signals",
      { timeout: 30_000 },
    );

    await expect(page.getByText("rate_limit_spike")).toBeVisible();
    await expect(page.getByText("unauthorized_ip_attempt")).toBeVisible();
    await expect(page.getByText("HIGH")).toBeVisible();
    await expect(page.getByText("MEDIUM")).toBeVisible();
  });
});
