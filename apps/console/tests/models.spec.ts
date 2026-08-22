import { test, expect } from "@playwright/test";

test.describe("D5 Models Discovery & Selection E2E", () => {
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

  test("displays real canonical models list with capabilities and context limits", async ({
    page,
  }) => {
    await page.goto("/northstar/production/models");
    await expect(page.locator("h1")).toHaveText("Models", { timeout: 30_000 });

    const table = page.locator(".models-table");
    await expect(table).toBeVisible({ timeout: 30_000 });

    // Verify canonical models
    await expect(table).toContainText("growx/fast");
    await expect(table).toContainText("openai/gpt-4o");
    await expect(table).toContainText("anthropic/claude-3-5-sonnet");
    await expect(table).toContainText("google/gemini-1.5-pro");
    await expect(table).toContainText("text-embedding-3-small");

    // Verify capabilities
    await expect(table).toContainText("Stream");
    await expect(table).toContainText("Tools");
    await expect(table).toContainText("JSON");
    await expect(table).toContainText("Vision");
  });

  test("searches models by query and filters by capability", async ({
    page,
  }) => {
    await page.goto("/northstar/production/models");
    await expect(page.locator("h1")).toHaveText("Models", { timeout: 30_000 });

    const searchInput = page.locator("input[aria-label='Search models']");
    const table = page.locator(".models-table");
    await expect(table).toBeVisible({ timeout: 30_000 });
    await expect(searchInput).toBeVisible({ timeout: 30_000 });

    // 1. Search by name
    await searchInput.fill("sonnet");
    await expect(table).toContainText("anthropic/claude-3-5-sonnet");
    await expect(table).not.toContainText("google/gemini-1.5-pro");

    // Clear search
    await searchInput.fill("");

    // 2. Filter by Embeddings capability tab
    await page.getByRole("tab", { name: "Embeddings" }).click();
    await expect(table).toContainText("text-embedding-3-small");
    await expect(table).toContainText("text-embedding-3-large");
    await expect(table).not.toContainText("growx/fast");

    // 3. Filter by Vision capability tab
    await page.getByRole("tab", { name: "Vision" }).click();
    await expect(table).toContainText("openai/gpt-4o");
    await expect(table).not.toContainText("text-embedding-3-small");
  });

  test("copies canonical model ID to clipboard", async ({ page }) => {
    await page.goto("/northstar/production/models");
    await expect(page.locator("h1")).toHaveText("Models", { timeout: 30_000 });

    const table = page.locator(".models-table");
    await expect(table).toBeVisible({ timeout: 30_000 });

    const row = page.locator(".models-table tr:has-text('growx/fast')");
    const copyBtn = row.locator(".btn-copy-icon");
    await copyBtn.click();
    await expect(row.getByText("✓")).toBeVisible();
  });

  test("navigates to model detail view with full specifications and quickstart cURL", async ({
    page,
  }) => {
    await page.goto("/northstar/production/models/openai%2Fgpt-4o");
    await expect(page.locator("h2.detail-title")).toHaveText(
      "OpenAI GPT-4o Flagship",
      { timeout: 30_000 },
    );

    // 1. Specs check
    await expect(page.locator(".metadata-dl")).toContainText("128,000 tokens");
    await expect(page.locator(".metadata-dl")).toContainText("16,384 tokens");

    // 2. Capability checklist
    const capList = page.locator(".capabilities-checklist");
    await expect(capList).toContainText("Streaming Output");
    await expect(capList).toContainText("Tool & Function Calling");
    await expect(capList).toContainText("Structured JSON Output");

    // 3. Quickstart cURL snippet
    const codeBlock = page.locator(".code-block");
    await expect(codeBlock).toBeVisible();
    await expect(codeBlock).toContainText("openai/gpt-4o");
  });

  test("model selector regression: click and keyboard selection work, emit correct ID, and block unavailable models", async ({
    page,
  }) => {
    await page.goto("/northstar/production/playground");
    await expect(page.locator("h1")).toHaveText("Playground", {
      timeout: 30_000,
    });

    const trigger = page.locator(".model-selector-trigger");
    await expect(trigger).toBeVisible({ timeout: 30_000 });

    // Initial state
    await expect(trigger).toContainText("growx/fast");

    // 1. Click to open dropdown
    await trigger.click();
    const dropdown = page.locator(".model-selector-dropdown");
    await expect(dropdown).toBeVisible({ timeout: 10_000 });

    // 2. Select openai/gpt-4o via click
    const gptOption = page
      .locator(".model-option-item:has-text('openai/gpt-4o')")
      .first();
    await gptOption.click();

    // Dropdown closes and trigger updates
    await expect(dropdown).not.toBeVisible();
    await expect(trigger).toContainText("openai/gpt-4o");

    // 3. Keyboard navigation test: Open with ArrowDown
    await trigger.press("ArrowDown");
    await expect(dropdown).toBeVisible();

    // Filter in dropdown
    const searchInput = page.locator(".dropdown-search-input");
    await searchInput.fill("claude");
    const claudeOption = page.locator(
      ".model-option-item:has-text('claude-3-5-sonnet')",
    );
    await expect(claudeOption).toBeVisible();

    // Select with Enter
    await searchInput.press("Enter");
    await expect(dropdown).not.toBeVisible();
    await expect(trigger).toContainText("claude-3-5-sonnet");

    // 4. Unavailable model test
    await trigger.click();
    await expect(dropdown).toBeVisible();
    const disabledOption = page.locator(".model-option-item.is-unavailable");
    if ((await disabledOption.count()) > 0) {
      await expect(disabledOption.first()).toBeVisible();
      await disabledOption.first().click({ force: true });
      await expect(trigger).toContainText("claude-3-5-sonnet");
    }
  });
});
