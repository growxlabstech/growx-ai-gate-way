import { test, expect } from "@playwright/test";

test.describe("D4 Workspace Overview E2E", () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
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

  test("displays active workspace overview with real operational metrics", async ({
    page,
  }) => {
    await page.goto("/northstar/production/overview");

    // 1. App Header
    await expect(page.locator("h1")).toHaveText("Workspace overview", {
      timeout: 30_000,
    });

    // 2. Metric Summary Grid
    const summaryGrid = page.locator(".overview-summary-grid");
    await expect(summaryGrid).toBeVisible({ timeout: 30_000 });
    await expect(summaryGrid).toContainText("1,280");
    await expect(summaryGrid).toContainText("99.4% success");
    await expect(summaryGrid).toContainText("$450.00");
    await expect(summaryGrid).toContainText("API keys");
    await expect(summaryGrid).toContainText("320ms");

    // 3. Models Table
    const modelsTable = page.locator(".overview-data-table").first();
    await expect(modelsTable).toBeVisible();
    await expect(modelsTable).toContainText("openai/gpt-4o");
    await expect(modelsTable).toContainText("anthropic/claude-3-5-sonnet");
    await expect(modelsTable).toContainText("growx/fast");

    // 4. Recent Requests Table
    await expect(page.getByText("Recent requests")).toBeVisible();
    await expect(page.locator(".overview-container")).toContainText(
      "req_01jq8a9x71",
    );
    await expect(page.locator(".overview-container")).toContainText("200 OK");
  });

  test("displays intentional first-run onboarding banner and zero-state for new workspace", async ({
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

    await page.goto("/orbit/core/overview");

    // 1. App Header & First-run banner
    await expect(page.locator("h1")).toHaveText("Workspace overview", {
      timeout: 30_000,
    });
    const firstRunCard = page.locator(".first-run-card");
    await expect(firstRunCard).toBeVisible({ timeout: 30_000 });
    await expect(firstRunCard).toContainText("Workspace Ready");
    await expect(
      firstRunCard.getByRole("link", { name: "Create an API Key" }),
    ).toBeVisible();
    await expect(
      firstRunCard.getByRole("link", { name: "Test in Playground" }),
    ).toBeVisible();

    // 2. Zero-traffic metrics
    const summaryGrid = page.locator(".overview-summary-grid");
    await expect(summaryGrid).toContainText("No traffic");
    await expect(summaryGrid).toContainText("$100.00");

    // 3. Empty tables state
    await expect(
      page.getByText("No model activity recorded yet in this workspace."),
    ).toBeVisible();
    await expect(
      page.getByText("No requests executed yet in this workspace."),
    ).toBeVisible();
  });

  test("isolates tenant data when switching between workspaces", async ({
    page,
  }) => {
    // 1. Visit production workspace
    await page.goto("/northstar/production/overview");
    await expect(page.locator("h1")).toHaveText("Workspace overview", {
      timeout: 30_000,
    });
    const summaryGrid = page.locator(".overview-summary-grid");
    await expect(summaryGrid).toBeVisible({ timeout: 30_000 });
    await expect(summaryGrid).toContainText("1,280");

    // 2. Switch workspace via sidebar select
    const workspaceSelect = page.locator(".sidebar .switchers select").nth(1);
    await workspaceSelect.selectOption("staging");

    // 3. Verify destination URL
    await page.waitForURL("**/northstar/staging/overview");
    await expect(page.locator(".topbar-context")).toContainText(
      "Staging Gateway",
    );
    // Verify scoped staging data (320 requests, not 1280)
    await expect(summaryGrid).toContainText("320");
    await expect(summaryGrid).not.toContainText("1,280");
  });
});
