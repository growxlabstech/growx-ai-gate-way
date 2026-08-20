import { describe, expect, it } from "vitest";
import {
  calculateNextNotificationAttemptMs,
  classifyNotificationOutcome,
  DEFAULT_NOTIFICATION_RETRY_POLICY,
  escapeHtml,
  getNotificationPolicy,
  NOTIFICATION_POLICY_CATALOG,
  renderNotificationContent,
} from "./index.js";

describe("Phase 23 — @growx/notifications Domain & Templates", () => {
  it("escapes malicious HTML characters in template variables", () => {
    const malicious = '<script>alert("xss")</script> & "quotes"';
    const escaped = escapeHtml(malicious);
    expect(escaped).toBe(
      "&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt; &amp; &quot;quotes&quot;"
    );
  });

  it("renders auth.otp template with OTP and expiration minutes in text and HTML", () => {
    const rendered = renderNotificationContent("auth.otp", "email", {
      otp: "123456",
      expiresInMinutes: 10,
    });

    expect(rendered.subject).toBe("Your GrowX AI verification code");
    expect(rendered.text).toContain("123456");
    expect(rendered.text).toContain("10 minutes");
    expect(rendered.html).toContain("123456");
  });

  it("fails visibly when a required template variable is missing", () => {
    expect(() =>
      renderNotificationContent("credit.low", "email", {})
    ).toThrow("Missing required variable 'remainingCredits'");
  });

  it("renders security.alert in both email and in_app channels", () => {
    const data = {
      title: "Suspicious sign-in detected",
      description: "Sign-in from unfamiliar IP 198.51.100.4",
      consoleUrl: "https://console.growx.ai/security/incidents/1",
    };

    const email = renderNotificationContent("security.alert", "email", data);
    expect(email.subject).toContain("Suspicious sign-in detected");
    expect(email.html).toContain("198.51.100.4");

    const inApp = renderNotificationContent("security.alert", "in_app", data);
    expect(inApp.title).toContain("Suspicious sign-in detected");
    expect(inApp.body).toContain("198.51.100.4");
    expect(inApp.actionUrl).toBe("https://console.growx.ai/security/incidents/1");
  });

  it("provides canonical policy catalog definitions", () => {
    const otpPolicy = getNotificationPolicy("auth.otp");
    expect(otpPolicy).toBeDefined();
    expect(otpPolicy!.priority).toBe("high");
    expect(otpPolicy!.preferenceMode).toBe("mandatory");

    const secPolicy = getNotificationPolicy("security.alert");
    expect(secPolicy).toBeDefined();
    expect(secPolicy!.priority).toBe("critical");
    expect(secPolicy!.preferenceMode).toBe("mandatory");
    expect(secPolicy!.defaultChannels).toEqual(["email", "in_app"]);
  });

  it("calculates exponential backoff and respects Retry-After header", () => {
    const delay1 = calculateNextNotificationAttemptMs(1, DEFAULT_NOTIFICATION_RETRY_POLICY);
    const delay2 = calculateNextNotificationAttemptMs(2, DEFAULT_NOTIFICATION_RETRY_POLICY);
    expect(delay2).toBeGreaterThanOrEqual(delay1);

    const retryAfter = calculateNextNotificationAttemptMs(
      1,
      DEFAULT_NOTIFICATION_RETRY_POLICY,
      30
    );
    expect(retryAfter).toBe(30_000);
  });

  it("classifies delivery outcomes accurately", () => {
    expect(
      classifyNotificationOutcome({
        responseStatus: 200,
        currentAttempt: 1,
        maxAttempts: 4,
      }).status
    ).toBe("delivered");

    expect(
      classifyNotificationOutcome({
        responseStatus: 429,
        currentAttempt: 1,
        maxAttempts: 4,
      }).status
    ).toBe("retrying");

    expect(
      classifyNotificationOutcome({
        responseStatus: 500,
        currentAttempt: 4,
        maxAttempts: 4,
      }).status
    ).toBe("failed");

    expect(
      classifyNotificationOutcome({
        responseStatus: 400,
        currentAttempt: 1,
        maxAttempts: 4,
      }).status
    ).toBe("failed");
  });
});
