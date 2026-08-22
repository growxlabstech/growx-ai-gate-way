import { test, expect } from "@playwright/test";

test.describe("D5 API Keys Lifecycle E2E", () => {
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

  test("displays real workspace API keys with masked prefixes and active status", async ({
    page,
  }) => {
    await page.goto("/northstar/production/api-keys");

    // 1. Header & Toolbar
    await expect(page.locator("h1")).toHaveText("API keys", {
      timeout: 30_000,
    });
    const createBtn = page
      .getByRole("button", { name: "Create API key" })
      .first();
    await expect(createBtn).toBeVisible({ timeout: 30_000 });
    await expect(page.locator(".keys-count-badge")).toContainText(
      "active key",
      { timeout: 30_000 },
    );

    // 2. Table Data
    const table = page.locator(".api-keys-table");
    await expect(table).toBeVisible({ timeout: 30_000 });
    await expect(table).toContainText("Production Backend API");
    await expect(table).toContainText("gx_live_key_01jq8a9xprod0001");
    await expect(table).toContainText("CI/CD Smoke Runner");
    await expect(table).toContainText("Legacy Pipeline v1 (Revoked)");
    await expect(table).toContainText("Revoked");
  });

  test("creates a new API key, displays raw secret exactly once, copies it, and destroys secret on close", async ({
    page,
  }) => {
    await page.goto("/northstar/production/api-keys");
    await expect(page.locator("h1")).toHaveText("API keys", {
      timeout: 30_000,
    });

    // 1. Open create dialog
    const createBtn = page
      .getByRole("button", { name: "Create API key" })
      .first();
    await expect(createBtn).toBeVisible({ timeout: 30_000 });
    await createBtn.click();
    const createDialog = page.locator(".create-key-dialog");
    await expect(createDialog).toBeVisible({ timeout: 30_000 });

    // 2. Fill form fields
    await page.locator("#key-name-input").fill("E2E Automated Agent");
    await page.locator("#key-env-select").selectOption("production");
    await page.locator("#key-expiry-select").selectOption("30");

    // Toggle a scope
    const batchCheckbox = page.locator(
      ".scope-checkbox-label:has-text('batches.create') input",
    );
    await batchCheckbox.check();

    // 3. Submit inside createDialog
    await createDialog.getByRole("button", { name: "Create API key" }).click();

    // 4. Secret Reveal Modal must appear exactly once
    const secretModal = page.locator(".secret-modal");
    await expect(secretModal).toBeVisible({ timeout: 30_000 });
    await expect(secretModal).toContainText("Save your API key");
    await expect(secretModal).toContainText(
      "Copy this key now. You won't be able to view it again.",
    );

    const secretInput = secretModal.locator(".secret-input");
    const secretValue = await secretInput.inputValue();
    expect(secretValue).toMatch(/^gx_live_key_/);

    // 5. Copy secret
    const copyBtn = secretModal.getByRole("button", { name: "Copy key" });
    await copyBtn.click();
    await expect(secretModal.getByText("Copied ✓")).toBeVisible({
      timeout: 30_000,
    });

    // 6. Close Modal
    await secretModal
      .getByRole("button", { name: "I have saved this key" })
      .click();
    await expect(secretModal).not.toBeVisible();

    // 7. Critical Security check: Raw secret must NOT be anywhere in the DOM
    await expect(page.locator("body")).not.toContainText(secretValue);

    // 8. New key metadata is now visible in the table
    const table = page.locator(".api-keys-table");
    await expect(table).toContainText("E2E Automated Agent");
  });

  test("revokes an active API key with destructive confirmation", async ({
    page,
  }) => {
    await page.goto("/northstar/production/api-keys");
    await expect(page.locator("h1")).toHaveText("API keys", {
      timeout: 30_000,
    });

    // 1. Click Revoke on the CI/CD Smoke Runner key row
    const row = page.locator(
      ".api-keys-table tr:has-text('CI/CD Smoke Runner')",
    );
    await expect(row).toBeVisible({ timeout: 30_000 });
    await row.getByRole("button", { name: "Revoke" }).click();

    // 2. Revoke modal appears
    const revokeModal = page.locator(".revoke-dialog");
    await expect(revokeModal).toBeVisible({ timeout: 30_000 });
    await expect(revokeModal).toContainText("Revoke API key");
    await expect(revokeModal).toContainText("Immediate access termination");

    // 3. Confirm revocation
    await revokeModal.getByRole("button", { name: "Revoke API key" }).click();
    await expect(revokeModal).not.toBeVisible();

    // 4. Status reflects revoked
    await expect(row).toContainText("Revoked");
  });

  test("isolates API keys per workspace and displays empty zero-state for new workspace", async ({
    context,
    page,
  }) => {
    await context.clearCookies();
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

    await page.goto("/orbit/core/api-keys");
    await expect(page.locator("h1")).toHaveText("API keys", {
      timeout: 30_000,
    });

    // 1. Empty state is shown
    const emptyState = page.locator(".empty-keys-state");
    await expect(emptyState).toBeVisible({ timeout: 30_000 });
    await expect(emptyState.getByText("No API keys yet")).toBeVisible();
    await expect(
      emptyState.getByRole("button", { name: "Create API key" }),
    ).toBeVisible();

    // 2. Tenant A keys are strictly absent
    await expect(page.locator("body")).not.toContainText(
      "Production Backend API",
    );
  });
});
