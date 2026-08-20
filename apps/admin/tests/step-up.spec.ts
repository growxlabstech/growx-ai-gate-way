import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/admin/step-up");
});

test("the complete tile toggles with pointer and keyboard", async ({
  page,
}) => {
  const tile = page.getByRole("checkbox", { name: /Manage AI providers/ });

  await expect(tile).toHaveAttribute("aria-checked", "false");
  await tile.getByText("Manage AI providers").click();
  await expect(tile).toHaveAttribute("aria-checked", "true");
  await tile.getByText("ops.provider.manage").click();
  await expect(tile).toHaveAttribute("aria-checked", "false");
  await tile.locator("span").last().click();
  await expect(tile).toHaveAttribute("aria-checked", "true");

  await tile.focus();
  await expect(tile).toBeFocused();
  await page.keyboard.press("Space");
  await expect(tile).toHaveAttribute("aria-checked", "false");
  await page.keyboard.press("Enter");
  await expect(tile).toHaveAttribute("aria-checked", "true");
  expect(
    await tile.evaluate(
      (element) => window.getComputedStyle(element).outlineStyle,
    ),
  ).not.toBe("none");
});

test("multiple selections survive reason and ticket edits", async ({
  page,
}) => {
  const provider = page.getByRole("checkbox", { name: /Manage AI providers/ });
  const billing = page.getByRole("checkbox", { name: /View billing records/ });

  await provider.click();
  await billing.click();
  await page
    .getByLabel("Operator reason")
    .fill("Investigating incident INC-84920");
  await page.getByLabel("Approval / ticket reference").fill("INC-84920");

  await expect(provider).toHaveAttribute("aria-checked", "true");
  await expect(billing).toHaveAttribute("aria-checked", "true");
});

test("every configured capability toggles independently", async ({ page }) => {
  const capabilityIds = [
    "ops.customer.read",
    "ops.request.inspect",
    "ops.request.content.read",
    "ops.support.session.create",
    "ops.provider.manage",
    "ops.routing.manage",
    "ops.feature_flag.manage",
    "ops.billing.read",
    "ops.billing.adjust",
    "ops.security.read",
    "ops.security.respond",
    "ops.audit.read",
    "ops.incident.manage",
  ];

  for (const capabilityId of capabilityIds) {
    const tile = page.getByRole("checkbox", {
      name: new RegExp(capabilityId),
    });

    await tile.click();
    await expect(tile).toHaveAttribute("aria-checked", "true");
  }

  await expect(
    page.locator('[role="checkbox"][aria-checked="true"]'),
  ).toHaveCount(capabilityIds.length);
});

test("empty selection blocks submission with inline validation", async ({
  page,
}) => {
  let requestCount = 0;
  await page.route("**/v1/auth/privileged/step-up", async (route) => {
    requestCount += 1;
    await route.fulfill({ status: 200, json: {} });
  });

  await page
    .getByLabel("Operator reason")
    .fill("Investigating incident INC-84920");
  await page.getByRole("button", { name: /Grant 15-Minute/ }).click();

  await expect(
    page.getByText("Select at least one required capability."),
  ).toBeVisible();
  expect(requestCount).toBe(0);
});

test("request contains exactly selected capabilities and shows denial", async ({
  page,
}) => {
  let payload: unknown;
  await page.route("**/v1/auth/privileged/step-up", async (route) => {
    payload = route.request().postDataJSON();
    await route.fulfill({ status: 400, json: { error: "Test denial" } });
  });

  await page
    .getByLabel("Operator reason")
    .fill("Investigating incident INC-84920");
  await page.getByLabel("Approval / ticket reference").fill("INC-84920");
  await page.getByRole("checkbox", { name: /Manage AI providers/ }).click();
  await page.getByRole("checkbox", { name: /View security posture/ }).click();
  await page.getByRole("button", { name: /Grant 15-Minute/ }).click();

  await expect(page.getByText("Test denial", { exact: true })).toBeVisible();
  expect(payload).toEqual({
    reason: "Investigating incident INC-84920",
    capabilities: ["ops.provider.manage", "ops.security.read"],
    approvalReference: "INC-84920",
    breakGlass: false,
  });
});

test("submission disables duplicates and success redirects", async ({
  page,
}) => {
  await page.route("**/v1/auth/privileged/step-up", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    await route.fulfill({
      status: 200,
      json: { privilegedSessionId: "psess_test" },
    });
  });
  await page.route("**/admin/users", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<title>Admin users</title>",
    });
  });

  await page
    .getByLabel("Operator reason")
    .fill("Investigating incident INC-84920");
  await page.getByRole("checkbox", { name: /Manage incidents/ }).click();
  const submit = page.locator('button[type="submit"]');

  await submit.evaluate((button) => {
    (button as HTMLButtonElement).click();
  });
  await expect(submit).toBeDisabled();
  await expect(
    page.getByRole("checkbox", { name: /Manage AI providers/ }),
  ).toBeDisabled();
  await page.waitForURL("**/admin/users");
});
