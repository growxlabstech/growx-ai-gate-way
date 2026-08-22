import { test, expect } from "@playwright/test";

test.describe("D7 Request History, Usage & Analytics E2E", () => {
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

  test("displays Usage & Spend dashboard with summary cards, SVG charts, and model breakdown", async ({
    page,
  }) => {
    await page.goto("/northstar/production/usage");
    await expect(page.locator("h1")).toHaveText("Usage & Spend", {
      timeout: 30_000,
    });

    // 1. Metric Summary Cards
    await expect(page.locator(".metric-cards-grid")).toBeVisible({
      timeout: 15_000,
    });
    const metricCards = page.locator(".analytics-metric-card");
    await expect(metricCards.nth(0)).toContainText("1,280");
    await expect(metricCards.nth(0)).toContainText("99.38% Success");
    await expect(metricCards.nth(1)).toContainText("842.0k");
    await expect(metricCards.nth(2)).toContainText("$50.00");
    await expect(metricCards.nth(3)).toContainText("320ms");

    // 2. Trend Charts
    await expect(page.locator(".analytics-chart-panel").first()).toBeVisible();
    await expect(page.getByText("Request Volume & Velocity")).toBeVisible();
    await expect(page.getByText("Token Consumption Trend")).toBeVisible();

    // 3. Modality strip
    const modalityStrip = page.locator(".modality-summary-strip");
    await expect(modalityStrip).toBeVisible();
    await expect(modalityStrip).toContainText("Text & Chat");
    await expect(modalityStrip).toContainText("Vision & Image");
    await expect(modalityStrip).toContainText("Audio & Speech");
    await expect(modalityStrip).toContainText("Embeddings");

    // 4. Model Breakdown Table
    const table = page.locator(".breakdown-table-container");
    await expect(table).toBeVisible();
    await expect(table).toContainText("GPT-4o");
    await expect(table).toContainText("Claude 3.5 Sonnet");
    await expect(table).toContainText("GrowX Fast Router");

    // 5. Switch to API Keys tab
    const apiKeyTab = page.getByRole("tab", { name: /API Key Breakdown/ });
    await apiKeyTab.click();
    await expect(page.getByText("Primary Production Pipeline")).toBeVisible({
      timeout: 15_000,
    });

    // 6. Switch to Error Breakdown tab
    const errTab = page.getByRole("tab", { name: /Error Breakdown/ });
    await errTab.click();
    await expect(page.getByText("rate_limit_exceeded")).toBeVisible({
      timeout: 15_000,
    });
  });

  test("renders Request Logs table with status pills, copyable IDs, and interactive filters", async ({
    page,
  }) => {
    await page.goto("/northstar/production/logs");
    await expect(page.locator("h1")).toHaveText("Request Logs", {
      timeout: 30_000,
    });

    const historyTable = page.locator(".history-table");

    // Verify row contents
    await expect(historyTable).toContainText("req_01jq8a9x71");
    await expect(historyTable).toContainText("openai/gpt-4o");
    await expect(historyTable).toContainText("Succeeded");
    await expect(historyTable).toContainText("$0.00310");

    // Copy Request ID
    const copyBtn = page.getByRole("button", {
      name: "Copy Request ID req_01jq8a9x71",
    });
    await copyBtn.click();
    await expect(copyBtn).toHaveText("✓");

    // Filter by Status: Failed
    const statusSelect = page.getByLabel("Filter by status");
    await statusSelect.selectOption("failed");

    // Table should now show only failed requests
    await expect(historyTable).toContainText("req_01jq8a5e89");
    await expect(historyTable).not.toContainText("req_01jq8a9x71");

    // Reset filters
    await page.getByRole("button", { name: "Reset Filters" }).click();
    await expect(historyTable).toContainText("req_01jq8a9x71");
  });

  test("inspects deep request detail with metrics, prompt content, provider attempts, and raw payloads", async ({
    page,
  }) => {
    await page.goto("/northstar/production/logs/req_01jq8a9x71");
    await expect(page.locator(".detail-request-id")).toHaveText(
      "req_01jq8a9x71",
      { timeout: 30_000 },
    );

    // Verify header status and cost
    await expect(page.locator(".status-pill")).toContainText("SUCCEEDED (200)");
    await expect(page.locator(".cost-val")).toHaveText("$0.00310");

    // Verify execution metrics
    const metricsGrid = page.locator(".detail-metrics-grid");
    await expect(metricsGrid).toContainText("185ms");
    await expect(metricsGrid).toContainText("48ms");
    await expect(metricsGrid).toContainText("420 / 200 (620)");
    await expect(metricsGrid).toContainText("Primary Production Pipeline");

    // Content tab (Standard retention)
    await page.getByRole("tab", { name: "Prompt & Response Content" }).click();
    await expect(
      page.getByText("You are a helpful, precision-engineered AI assistant."),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Distributed AI Gateways operate as an authoritative abstraction boundary",
      ),
    ).toBeVisible();

    // Attempts tab
    await page.getByRole("tab", { name: /Provider Attempts/ }).click();
    await expect(page.locator(".attempts-tab-pane")).toContainText(
      "gpt-4o-2024-08-06",
    );

    // Raw tab
    await page.getByRole("tab", { name: "Raw JSON Payload" }).click();
    await expect(page.locator(".raw-tab-pane")).toContainText(
      '"model": "openai/gpt-4o"',
    );
  });

  test("displays canonical error diagnostics for failed request with zero cost", async ({
    page,
  }) => {
    await page.goto("/northstar/production/logs/req_01jq8a5e89");
    await expect(page.locator(".detail-request-id")).toHaveText(
      "req_01jq8a5e89",
      { timeout: 30_000 },
    );

    // Error diagnostics banner
    const errorCard = page.locator(".detail-error-card");
    await expect(errorCard).toContainText("rate_limit_exceeded");
    await expect(errorCard).toContainText("Retryable Error");
    await expect(errorCard).toContainText(
      "Upstream provider rate limit exceeded",
    );

    // Authoritative settled cost is $0
    await expect(page.locator(".cost-val")).toHaveText("$0.00000");
  });

  test("enforces Phase-35 zero content retention in Staging workspace", async ({
    page,
  }) => {
    await page.goto("/northstar/staging/logs/req_01jq8a9x71");
    await expect(page.locator(".detail-request-id")).toHaveText(
      "req_01jq8a9x71",
      { timeout: 30_000 },
    );

    // Content tab in Staging (Zero Retention)
    await page.getByRole("tab", { name: "Prompt & Response Content" }).click();
    const govCard = page.locator(".governance-notice-card");
    await expect(govCard).toBeVisible();
    await expect(govCard).toContainText("Prompt & Output Content Not Retained");
    await expect(govCard).toContainText(
      "Prompt and response content was not retained for this workspace per data retention policy",
    );

    // Prompt content must NOT be in DOM
    await expect(
      page.getByText("You are a helpful, precision-engineered AI assistant."),
    ).not.toBeVisible();
  });

  test("enforces cross-tenant request detail isolation (404 on foreign workspace request)", async ({
    page,
  }) => {
    // Attempt to access Orbit request under Northstar workspace
    await page.goto("/northstar/production/logs/req_orbit_01");
    await expect(
      page.getByText("This organization, workspace, or page is unavailable."),
    ).toBeVisible();
  });

  test("workspace switch completely isolates usage analytics and request logs", async ({
    context,
    page,
  }) => {
    // 1. Open Northstar Production Usage
    await page.goto("/northstar/production/usage");
    await expect(page.locator(".metric-card-number").first()).toHaveText(
      "1,280",
      { timeout: 30_000 },
    );
    await expect(
      page.locator(".metric-card-number.text-accent-success"),
    ).toHaveText("$50.00");

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

    await page.goto("/orbit/core/usage");
    await expect(page.locator(".metric-card-number").first()).toHaveText(
      "340",
      { timeout: 30_000 },
    );
    await expect(
      page.locator(".metric-card-number.text-accent-success"),
    ).toHaveText("$14.25");

    // 3. Open Orbit Request Logs
    await page.goto("/orbit/core/logs");
    await expect(page.locator(".history-table")).toContainText("req_orbit_01");
    await expect(page.locator(".history-table")).not.toContainText(
      "req_01jq8a9x71",
    );
  });

  test("navigates seamlessly from Overview (D4) to Usage and Logs (D7)", async ({
    page,
  }) => {
    await page.goto("/northstar/production/overview");
    await expect(page.locator("h1")).toHaveText("Workspace overview", {
      timeout: 30_000,
    });

    // Click "View all in logs"
    await page.getByRole("link", { name: "View all in logs" }).click();
    await expect(page).toHaveURL(/\/northstar\/production\/logs/);
    await expect(page.locator("h1")).toHaveText("Request Logs");
  });
});
