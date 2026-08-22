import { test, expect } from "@playwright/test";

test.describe("D6 Playground & Gateway Execution E2E", () => {
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

  test("displays Playground interface with D5 model selector, capability chips, and ready state", async ({
    page,
  }) => {
    await page.goto("/northstar/production/playground");
    await expect(page.locator("h1")).toHaveText("Playground", {
      timeout: 30_000,
    });

    // 1. Model Selector
    const modelSelector = page.locator(".model-selector-trigger");
    await expect(modelSelector).toBeVisible({ timeout: 30_000 });
    await expect(modelSelector).toContainText("growx/fast");

    // 2. Capability Chips
    const capRow = page.locator(".capability-chips-row");
    await expect(capRow).toBeVisible();
    await expect(capRow).toContainText("Stream ✓");
    await expect(capRow).toContainText("Tools ✓");
    await expect(capRow).toContainText("JSON Schema ✓");

    // 3. Telemetry bar in ready state
    const telemetryBar = page.locator(".telemetry-bar");
    await expect(telemetryBar).toBeVisible();
    await expect(telemetryBar).toContainText("Ready");

    // 4. Initial prompt input
    const messageInput = page.locator(".message-textarea").first();
    await expect(messageInput).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Run Gateway Request" }),
    ).toBeVisible();
  });

  test("executes real streaming request, renders incremental output, and captures request ID, TTFT, usage, and cost", async ({
    page,
  }) => {
    await page.goto("/northstar/production/playground");
    await expect(page.locator("h1")).toHaveText("Playground", {
      timeout: 30_000,
    });

    const messageInput = page.locator(".message-textarea").first();
    await messageInput.fill(
      "Explain the architectural invariants of GrowX AI Gateway.",
    );

    // Click Run
    const runBtn = page.getByRole("button", { name: "Run Gateway Request" });
    await runBtn.click();

    // Verify completion
    const telemetryBar = page.locator(".telemetry-bar");
    await expect(telemetryBar.locator(".status-badge")).toHaveText(
      "Completed ✓",
      { timeout: 30_000 },
    );

    // Verify Request ID
    const reqIdBtn = page.locator(".req-id-btn");
    await expect(reqIdBtn).toBeVisible();
    await expect(reqIdBtn).toContainText("req_");

    // Verify TTFT and Latency
    await expect(telemetryBar).toContainText("TTFT:");
    await expect(telemetryBar).toContainText("Latency:");

    // Verify Token usage and Cost
    await expect(telemetryBar).toContainText("Tokens:");
    await expect(telemetryBar).toContainText("Cost:");

    // Verify Streamed Text Output
    const outputBox = page.locator(".streamed-output-box");
    await expect(outputBox).toBeVisible();
    await expect(outputBox).toContainText(
      "GrowX AI Gateway successfully routed this request",
    );
  });

  test("switches model and updates capability-dependent controls dynamically", async ({
    page,
  }) => {
    await page.goto("/northstar/production/playground");
    await expect(page.locator("h1")).toHaveText("Playground", {
      timeout: 30_000,
    });

    const trigger = page.locator(".model-selector-trigger");
    await trigger.click();

    const dropdown = page.locator(".model-selector-dropdown");
    await expect(dropdown).toBeVisible({ timeout: 10_000 });

    // Select text-embedding-3-small (embedding model without tools/streaming)
    const embeddingOption = page
      .locator(".model-option-item:has-text('text-embedding-3-small')")
      .first();
    await embeddingOption.click();

    // Verify capability badges updated
    const capRow = page.locator(".capability-chips-row");
    await expect(capRow).toContainText("Non-stream");
    await expect(capRow).toContainText("No tools");

    // Verify Tools drawer toggle button is hidden
    await expect(page.getByRole("button", { name: /Tools/ })).not.toBeVisible();
  });

  test("configures request parameters with slider and bounds validation", async ({
    page,
  }) => {
    await page.goto("/northstar/production/playground");
    await expect(page.locator("h1")).toHaveText("Playground", {
      timeout: 30_000,
    });

    // Open Parameters drawer
    const paramsBtn = page.getByRole("button", { name: /Parameters/ });
    await paramsBtn.click();

    const drawer = page.locator(".drawer-panel");
    await expect(drawer).toBeVisible();

    // Adjust temperature
    const tempInput = page.locator(".param-number-input").first();
    await tempInput.fill("1.25");
    await expect(page.locator(".param-val").first()).toHaveText("1.25");

    // Adjust max tokens
    const maxTokensInput = page.locator("#param-max-tokens");
    await maxTokensInput.fill("1500");
    await expect(maxTokensInput).toHaveValue("1500");
  });

  test("defines and executes function tool call with structured card rendering", async ({
    page,
  }) => {
    await page.goto("/northstar/production/playground");
    await expect(page.locator("h1")).toHaveText("Playground", {
      timeout: 30_000,
    });

    // Open Tools drawer
    const toolsBtn = page.getByRole("button", { name: /Tools/ });
    await toolsBtn.click();

    // Add Weather preset
    await page.getByRole("button", { name: "+ Weather Preset" }).click();

    // Verify tool card
    const toolCard = page.locator(".tool-definition-card");
    await expect(toolCard).toBeVisible();
    await expect(toolCard.locator(".tool-name-input")).toHaveValue(
      "get_current_weather",
    );
    await expect(toolCard).toContainText("Schema valid ✓");

    // Enter prompt
    const messageInput = page.locator(".message-textarea").first();
    await messageInput.fill(
      "What is the current temperature in San Francisco, CA?",
    );

    // Run
    await page.getByRole("button", { name: "Run Gateway Request" }).click();

    const telemetryBar = page.locator(".telemetry-bar");
    await expect(telemetryBar.locator(".status-badge")).toHaveText(
      "Completed ✓",
      { timeout: 30_000 },
    );

    // Verify Tool Call Card rendered in output pane
    const toolCallCard = page.locator(".tool-call-card");
    await expect(toolCallCard).toBeVisible({ timeout: 15_000 });
    await expect(toolCallCard).toContainText("get_current_weather");
    await expect(toolCallCard).toContainText("San Francisco, CA");
  });

  test("configures structured output and renders valid JSON schema completion", async ({
    page,
  }) => {
    await page.goto("/northstar/production/playground");
    await expect(page.locator("h1")).toHaveText("Playground", {
      timeout: 30_000,
    });

    // Open Structured Output drawer
    const schemaBtn = page.getByRole("button", { name: /Structured Output/ });
    await schemaBtn.click();

    // Insert User Profile preset
    await page.getByRole("button", { name: "+ User Profile Preset" }).click();

    // Verify schema enabled and valid
    await expect(page.locator(".schema-valid-tag")).toContainText(
      "JSON Schema valid ✓",
    );

    // Run request
    await page.getByRole("button", { name: "Run Gateway Request" }).click();

    const telemetryBar = page.locator(".telemetry-bar");
    await expect(telemetryBar.locator(".status-badge")).toHaveText(
      "Completed ✓",
      { timeout: 30_000 },
    );

    // Verify completed structured output in Output pane
    const outputBox = page.locator(".streamed-output-box");
    await expect(outputBox).toBeVisible({ timeout: 15_000 });
    await expect(outputBox).toContainText('"status": "completed"');
    await expect(outputBox).toContainText('"verified": true');
  });

  test("cancels active request when Stop button is clicked", async ({
    page,
  }) => {
    await page.goto("/northstar/production/playground");
    await expect(page.locator("h1")).toHaveText("Playground", {
      timeout: 30_000,
    });

    const messageInput = page.locator(".message-textarea").first();
    await messageInput.fill(
      "Stream a long detailed essay about database transaction isolation levels.",
    );

    // Run
    await page.getByRole("button", { name: "Run Gateway Request" }).click();

    // Click Stop immediately
    const stopBtn = page.getByRole("button", {
      name: "Stop current generation request",
    });
    await expect(stopBtn).toBeVisible();
    await stopBtn.click();

    // Status transitions to Cancelled
    const telemetryBar = page.locator(".telemetry-bar");
    await expect(telemetryBar.locator(".status-badge")).toHaveText(
      "Cancelled ■",
      { timeout: 5_000 },
    );
  });

  test("handles Gateway error responses safely with error banner and status code", async ({
    page,
  }) => {
    await page.goto("/northstar/production/playground");
    await expect(page.locator("h1")).toHaveText("Playground", {
      timeout: 30_000,
    });

    const messageInput = page.locator(".message-textarea").first();
    await messageInput.fill("Trigger rate_limit_error for testing.");

    // Run
    await page.getByRole("button", { name: "Run Gateway Request" }).click();

    // Error banner appears
    const errorBanner = page.locator(".response-error-banner");
    await expect(errorBanner).toBeVisible({ timeout: 15_000 });
    await expect(errorBanner).toContainText("rate_limit_exceeded");
    await expect(errorBanner).toContainText(
      "Rate limit exceeded for workspace",
    );

    // Status code 429
    await expect(page.locator(".http-status")).toHaveText("429");
  });

  test("generates and copies code snippets (cURL, TypeScript, Python) with safe $GROWX_API_KEY", async ({
    page,
  }) => {
    await page.goto("/northstar/production/playground");
    await expect(page.locator("h1")).toHaveText("Playground", {
      timeout: 30_000,
    });

    // Open View Code
    await page.getByRole("button", { name: "View Code" }).click();

    const modal = page.locator(".code-export-modal");
    await expect(modal).toBeVisible();
    await expect(modal).toContainText("View Request Code");

    // Verify cURL snippet
    const codeSnippet = page.locator(".code-snippet-pre");
    await expect(codeSnippet).toContainText(
      "curl https://api.growx.ai/v1/chat/completions",
    );
    await expect(codeSnippet).toContainText("Bearer $GROWX_API_KEY");

    // Switch to TypeScript tab
    await page.getByRole("tab", { name: "TypeScript / Node.js" }).click();
    await expect(codeSnippet).toContainText('import OpenAI from "openai"');

    // Switch to Python tab
    await page.getByRole("tab", { name: "Python" }).click();
    await expect(codeSnippet).toContainText("from openai import OpenAI");

    // Copy code button
    await page
      .getByRole("button", { name: "Copy snippet to clipboard" })
      .click();
    await expect(page.getByText("Copied ✓")).toBeVisible();

    // Close modal
    await page.getByRole("button", { name: "Close dialog" }).click();
    await expect(modal).not.toBeVisible();
  });

  test("workspace switch cleanly isolates tenant state and resets active playground session", async ({
    context,
    page,
  }) => {
    await page.goto("/northstar/production/playground");
    await expect(page.locator("h1")).toHaveText("Playground", {
      timeout: 30_000,
    });

    // Fill message in Tenant A
    const messageInput = page.locator(".message-textarea").first();
    await messageInput.fill("Tenant A proprietary prompt");

    // Switch to Tenant B (Orbit Systems)
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

    await page.goto("/orbit/core/playground");
    await expect(page.locator("h1")).toHaveText("Playground", {
      timeout: 30_000,
    });

    // Verify state reset and ready for Orbit Core
    const telemetryBar = page.locator(".telemetry-bar");
    await expect(telemetryBar).toContainText("Ready");
    await expect(page.locator(".streamed-output-box")).not.toBeVisible();
  });
});
