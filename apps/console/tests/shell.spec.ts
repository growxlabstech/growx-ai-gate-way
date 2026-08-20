import { expect, test } from "@playwright/test";

test.beforeEach(async ({ context }) => {
  await context.addCookies([{ name: "gx_fixture", value: "tenant-a", domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
});

test("real context drives navigation, workspace switching, refresh, and sign out", async ({ page }) => {
  await page.goto("/northstar/production/overview");
  await expect(page.getByLabel("Current context")).toContainText("Northstar Labs");
  await expect(page.getByLabel("Current context")).toContainText("Production Gateway");
  await expect(page.getByRole("link", { name: "Workspace overview" })).toHaveAttribute("aria-current", "page");

  await page.getByRole("link", { name: "Models" }).click();
  await expect(page).toHaveURL(/\/northstar\/production\/models$/);
  await expect(page.getByRole("link", { name: "Models" })).toHaveAttribute("aria-current", "page");
  await page.getByRole("link", { name: "API keys" }).click();
  await expect(page.getByRole("link", { name: "API keys" })).toHaveAttribute("aria-current", "page");
  await page.getByRole("link", { name: "Usage" }).click();
  await expect(page.getByRole("link", { name: "Usage" })).toHaveAttribute("aria-current", "page");

  await page.getByLabel("Workspace").selectOption("staging");
  await expect(page).toHaveURL(/\/northstar\/staging\/usage$/);
  await expect(page.getByLabel("Current context")).toContainText("Staging Gateway");
  await expect(page.getByLabel("Current context")).not.toContainText("Production Gateway");
  await page.reload();
  await expect(page.getByLabel("Workspace")).toHaveValue("staging");

  await page.getByRole("button", { name: "Open account menu" }).click();
  await expect(page.getByRole("menu", { name: "Account" })).toContainText("avery@northstar.example");
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/sign-in\?returnTo=/);
});

test("unauthorized tenant context fails without rendering the previous shell", async ({ context, page }) => {
  await context.clearCookies();
  await context.addCookies([{ name: "gx_fixture", value: "tenant-b", domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
  await page.goto("/northstar/production/overview");
  await expect(page.getByText("This organization, workspace, or page is unavailable.")).toBeVisible();
  await expect(page.getByText("Northstar Labs")).toHaveCount(0);
});

test("narrow navigation opens, closes with Escape, and returns focus", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/northstar/production/overview");
  const trigger = page.getByRole("button", { name: "Open primary navigation" });
  await trigger.click();
  await expect(page.getByLabel("Console navigation")).toHaveClass(/is-mobile-open/);
  await page.keyboard.press("Escape");
  await expect(page.getByLabel("Console navigation")).not.toHaveClass(/is-mobile-open/);
  await expect(trigger).toBeFocused();
});
