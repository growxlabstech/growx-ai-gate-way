import { describe, expect, it } from "vitest";
import { parseUserAgent } from "../src/session-management";
import {
  checkOtpStartRateLimit,
  checkOtpResendCooldown,
  checkOtpVerifyRateLimit,
} from "../src/redis-rate-limit";

describe("parseUserAgent", () => {
  it("formats user agent string into friendly browser and OS summary", () => {
    expect(
      parseUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
      ),
    ).toBe("Chrome on Windows");
    expect(
      parseUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
      ),
    ).toBe("Safari on macOS");
    expect(parseUserAgent(null)).toBe("Unknown Device");
  });
});

describe("redis-rate-limit abuse controls", () => {
  it("enforces OTP start rate limits per IP and email", () => {
    const ip = "192.168.1.100";
    const email = "user@example.com";
    const now = new Date("2026-08-13T12:00:00Z");

    for (let i = 0; i < 3; i++) {
      const res = checkOtpStartRateLimit(ip, email, now);
      expect(res.allowed).toBe(true);
    }
  });

  it("enforces OTP resend cooldown window", () => {
    const email = "cooldown@example.com";
    const now = new Date("2026-08-13T12:00:00Z");

    const first = checkOtpResendCooldown(email, now);
    expect(first.allowed).toBe(true);

    const second = checkOtpResendCooldown(
      email,
      new Date(now.getTime() + 10_000),
    );
    expect(second.allowed).toBe(false);
    expect(second.retryAfterSeconds).toBe(50);
  });

  it("enforces OTP verification attempt limits", () => {
    const challengeId = "chal_test123";
    const now = new Date("2026-08-13T12:00:00Z");

    for (let i = 0; i < 5; i++) {
      const res = checkOtpVerifyRateLimit(challengeId, now);
      expect(res.allowed).toBe(true);
    }

    const exceeded = checkOtpVerifyRateLimit(challengeId, now);
    expect(exceeded.allowed).toBe(false);
    expect(exceeded.error).toContain("Maximum verification attempts exceeded");
  });
});
