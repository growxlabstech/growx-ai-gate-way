import { expect, test } from "@playwright/test";

test.beforeEach(async ({ context }) => {
  await context.clearCookies();
});

test("returning user verifies OTP and returns to an authorized deep link", async ({
  page,
}) => {
  await page.goto("/northstar/production/api-keys?tab=active");
  await expect(page).toHaveURL(/\/sign-in\?returnTo=/);
  await page
    .getByRole("textbox", { name: "EMAIL" })
    .fill("avery@northstar.example");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Verify email" }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Six digit verification code" })
    .fill("111111");
  await page.waitForURL(/\/northstar\/production\/api-keys\?tab=active$/, {
    timeout: 30_000,
  });
  await expect(page.getByLabel("Current context")).toContainText(
    "Production Gateway",
  );
});

test("new user creates persisted organization and default workspace, then resumes ready state", async ({
  page,
}) => {
  await page.goto("/sign-in");
  await page
    .getByRole("textbox", { name: "EMAIL" })
    .fill("new.user@example.com");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Six digit verification code" })
    .fill("222222");
  await expect(page).toHaveURL(/\/onboarding$/);
  await expect(
    page.getByRole("heading", { name: "Create your organization" }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Organization name" })
    .fill("Acme Labs");
  await page.getByRole("button", { name: "Create organization" }).dblclick();
  await expect(page).toHaveURL(/\/acme-labs\/default\/overview$/);
  await page.reload();
  await expect(page.getByLabel("Current context")).toContainText("Acme Labs");
  await page.goto("/onboarding");
  await expect(page).toHaveURL(/\/acme-labs\/default\/overview$/);
});

test("invalid and expired OTP states preserve recovery controls", async ({
  page,
}) => {
  await page.goto("/sign-in");
  await page
    .getByRole("textbox", { name: "EMAIL" })
    .fill("avery@northstar.example");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  const otp = page.getByRole("textbox", {
    name: "Six digit verification code",
  });
  await otp.fill("999999");
  await expect(page.locator(".auth-error")).toHaveText(
    "Invalid code. Try again.",
  );
  await expect(otp).toHaveValue("999999");
  await otp.fill("");
  await otp.fill("000000");
  await expect(page.locator(".auth-error")).toContainText("expired");
  await expect(
    page.getByRole("button", { name: /Resend code in/ }),
  ).toBeDisabled();
});

test("rate limiting and change-email recovery are explicit", async ({
  page,
}) => {
  await page.goto("/sign-in");
  const email = page.getByRole("textbox", { name: "EMAIL" });
  await email.fill("rate.limit@example.com");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.locator(".auth-error")).toHaveText(
    "Too many attempts. Try again in 42s.",
  );
  await email.fill("avery@northstar.example");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Change" }).click();
  await expect(email).toBeFocused();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("legacy auth routes normalize and configured-only OAuth stays hidden", async ({
  context,
  page,
}) => {
  await page.goto("/sign-up?returnTo=%2Fnorthstar%2Fproduction%2Foverview");
  await expect(page).toHaveURL(/\/sign-in\?returnTo=/);
  await expect(page.getByRole("button", { name: /Continue with/ })).toHaveCount(
    0,
  );
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
  await page.goto("/sign-in");
  await expect(page).toHaveURL(/\/northstar\/production\/overview$/);
});

test("unsafe returnTo and expired sessions fail safely", async ({
  context,
  page,
}) => {
  await page.goto("/sign-in?returnTo=https://evil.example");
  await expect(page).toHaveURL(/\/sign-in\?returnTo=https:\/\/evil\.example$/);
  await page
    .getByRole("textbox", { name: "EMAIL" })
    .fill("avery@northstar.example");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Six digit verification code" })
    .fill("111111");
  await expect(page).toHaveURL(/\/northstar\/production\/overview$/);
  await context.clearCookies();
  await page.goto("/northstar/production/overview");
  await expect(page).toHaveURL(/\/sign-in\?returnTo=/);
  await expect(page.getByText("Northstar Labs")).toHaveCount(0);
});

test("email-authenticated invitation acceptance reaches the invited workspace", async ({
  page,
}) => {
  await page.goto("/accept-invitation?token=valid-invite-token-123");
  await expect(page).toHaveURL(/\/sign-in\?returnTo=/);
  await page
    .getByRole("textbox", { name: "EMAIL" })
    .fill("avery@northstar.example");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Six digit verification code" })
    .fill("111111");
  await expect(
    page.getByRole("heading", { name: "Join your GrowX workspace" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Accept invitation" }).click();
  await expect(page).toHaveURL(/\/northstar\/production\/overview$/);
});
