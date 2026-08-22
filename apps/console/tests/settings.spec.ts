import { test, expect } from "@playwright/test";

test.describe("D9 Customer Settings, Team & Webhooks E2E", () => {
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

  test("loads organization settings, copies ID, and renames organization", async ({
    page,
  }) => {
    await page.goto("/northstar/settings");
    await expect(page.locator("h1")).toHaveText("Organization Settings", {
      timeout: 30_000,
    });

    // Verify profile fields
    const nameInput = page.locator("#org-name-input");
    await expect(nameInput).toHaveValue("Northstar Technologies");
    await expect(page.locator(".id-code")).toHaveText("org_northstar");
    await expect(page.getByText("Scale Enterprise")).toBeVisible();

    // Copy ID action
    const copyBtn = page.getByRole("button", { name: "Copy Organization ID" });
    await copyBtn.click();
    await expect(copyBtn).toHaveText("Copied ✓");

    // Rename organization
    await nameInput.fill("Northstar Global Technologies");
    await page.getByRole("button", { name: "Save Changes" }).click();
    await expect(
      page.getByText("✓ Organization name updated successfully."),
    ).toBeVisible();

    // Verify Danger Zone
    await expect(page.getByText("Danger Zone")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Delete Organization" }),
    ).toBeDisabled();
  });

  test("loads workspace settings, configures Phase-35 zero retention, and renames workspace", async ({
    page,
  }) => {
    await page.goto("/northstar/production/settings");
    await expect(page.locator("h1")).toHaveText("Workspace Settings", {
      timeout: 30_000,
    });

    const wsInput = page.locator("#ws-name-input");
    await expect(wsInput).toHaveValue("Production Gateway");
    await expect(page.locator(".id-code")).toHaveText("ws_production");

    // Change data retention policy
    const retentionSelect = page.locator("#retention-policy-select");
    await expect(retentionSelect).toHaveValue("standard");
    await retentionSelect.selectOption("zero_retention");

    // Save changes
    await page.getByRole("button", { name: "Save Changes" }).click();
    await expect(
      page.getByText("✓ Workspace settings updated successfully."),
    ).toBeVisible();
  });

  test("manages team members, invites new developer, and revokes pending invitation", async ({
    page,
  }) => {
    await page.goto("/northstar/members");
    await expect(page.locator("h1")).toHaveText("Team Members", {
      timeout: 30_000,
    });

    // Verify active members
    await expect(page.getByText("Alex Thorne (You)")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("Sarah Chen")).toBeVisible();
    await expect(page.getByText("Marcus Brody")).toBeVisible();

    // Verify existing pending invitation
    await expect(
      page.getByText("jordan.taylor@northstar.example.com"),
    ).toBeVisible();
    await expect(page.getByText("PENDING", { exact: true })).toBeVisible();

    // Revoke pending invite
    await page.getByRole("button", { name: "Revoke" }).click();
    await expect(
      page.getByText("jordan.taylor@northstar.example.com"),
    ).not.toBeVisible();

    // Open Invite Member dialog
    await page.getByRole("button", { name: "+ Invite Member" }).click();
    const modal = page.locator(".dialog-card");
    await expect(modal).toBeVisible();
    await expect(modal.getByText("Invite Organization Member")).toBeVisible();

    // Fill invitation
    await modal
      .locator("#invite-email-input")
      .fill("new.eng@northstar.example.com");
    await modal.locator("#invite-role-select").selectOption("Developer");
    await modal.getByRole("button", { name: "Send Invitation" }).click();

    // Verify new invite added to pending table
    await expect(page.getByText("new.eng@northstar.example.com")).toBeVisible();
  });

  test("configures customer webhooks with display-once signing secret and test ping", async ({
    page,
  }) => {
    await page.goto("/northstar/production/webhooks");
    await expect(page.locator("h1")).toHaveText("Webhooks", {
      timeout: 30_000,
    });

    // Verify existing endpoint
    await expect(
      page.getByText("https://api.northstar.example.com/webhooks/growx-events"),
    ).toBeVisible();
    await expect(page.getByText("ACTIVE")).toBeVisible();

    // Test ping delivery
    await page.getByRole("button", { name: "Test Ping" }).first().click();
    await expect(
      page.getByText(
        /Test event signed with HMAC-SHA256 successfully delivered/,
      ),
    ).toBeVisible();

    // Open Add Webhook Endpoint dialog
    await page.getByRole("button", { name: "+ Add Webhook Endpoint" }).click();
    const modal = page.locator(".dialog-card");
    await expect(modal).toBeVisible();

    // Fill new endpoint
    await modal
      .locator("#ep-url-input")
      .fill("https://api.northstar.example.com/webhooks/billing");
    await modal.locator("#ep-desc-input").fill("Billing events listener");
    await modal.getByRole("button", { name: "Create Webhook" }).click();

    // Verify secret display-once banner
    const secretBanner = page.locator(".secret-display-once-banner");
    await expect(secretBanner).toBeVisible();
    await expect(
      secretBanner.getByText("Webhook Signing Secret (Display-Once)"),
    ).toBeVisible();
    await expect(secretBanner.locator(".secret-code")).toContainText("whsec_");

    // Copy secret
    await secretBanner.getByRole("button", { name: "Copy Secret" }).click();

    // Dismiss banner -> secret never redisplayed
    await secretBanner
      .getByRole("button", { name: /I have stored my secret securely/ })
      .click();
    await expect(secretBanner).not.toBeVisible();

    // Verify new endpoint is in table
    await expect(
      page.getByText("https://api.northstar.example.com/webhooks/billing"),
    ).toBeVisible();
  });

  test("enforces strict tenant isolation on team and settings", async ({
    context,
    page,
  }) => {
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

    await page.goto("/orbit/settings");
    await expect(page.locator("h1")).toHaveText("Organization Settings", {
      timeout: 30_000,
    });
    await expect(page.locator("#org-name-input")).toHaveValue(
      "Orbit Intelligence",
    );

    await page.goto("/orbit/members");
    await expect(page.locator("h1")).toHaveText("Team Members", {
      timeout: 30_000,
    });
    await expect(page.getByText("Devon Vance (You)")).toBeVisible();
    await expect(page.getByText("Alex Thorne")).not.toBeVisible();
  });
});
