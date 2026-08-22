import { evaluateFixedWindow, type RateLimit } from "@growx/rate-limits";

interface StoreEntry {
  count: number;
  resetAt: number;
}

const memoryStore = new Map<string, StoreEntry>();

function getMemoryCount(key: string, windowSeconds: number, now: Date): number {
  const current = memoryStore.get(key);
  const nowMs = now.getTime();
  if (!current || current.resetAt <= nowMs) {
    memoryStore.set(key, { count: 1, resetAt: nowMs + windowSeconds * 1000 });
    return 1;
  }
  current.count += 1;
  return current.count;
}

export function checkOtpStartRateLimit(
  ip: string,
  email: string,
  now = new Date(),
) {
  const ipPolicy: RateLimit = { dimension: "ip", window: "minute", limit: 5 };
  const emailPolicy: RateLimit = {
    dimension: "endpoint",
    window: "minute",
    limit: 3,
  };

  const ipKey = `auth:otp:start:ip:${ip}`;
  const emailKey = `auth:otp:start:email:${email.toLowerCase().trim()}`;

  const ipCount = getMemoryCount(ipKey, 60, now);
  const emailCount = getMemoryCount(emailKey, 60, now);

  const ipDecision = evaluateFixedWindow(ipCount - 1, ipPolicy, now);
  const emailDecision = evaluateFixedWindow(emailCount - 1, emailPolicy, now);

  if (!ipDecision.allowed) {
    return {
      allowed: false,
      error:
        "Too many authentication attempts from this IP address. Please wait.",
    };
  }
  if (!emailDecision.allowed) {
    return {
      allowed: false,
      error:
        "Too many code requests for this email address. Please wait before requesting another.",
    };
  }

  return { allowed: true };
}

export function checkOtpResendCooldown(email: string, now = new Date()) {
  const key = `auth:otp:resend:${email.toLowerCase().trim()}`;
  const entry = memoryStore.get(key);
  const nowMs = now.getTime();

  if (entry && entry.resetAt > nowMs) {
    const retryAfter = Math.ceil((entry.resetAt - nowMs) / 1000);
    return {
      allowed: false,
      retryAfterSeconds: retryAfter,
      error: `Please wait ${retryAfter}s before requesting a new code.`,
    };
  }

  memoryStore.set(key, { count: 1, resetAt: nowMs + 60 * 1000 }); // 60s cooldown
  return { allowed: true };
}

export function checkOtpVerifyRateLimit(challengeId: string, now = new Date()) {
  const policy: RateLimit = {
    dimension: "endpoint",
    window: "minute",
    limit: 5,
  };
  const key = `auth:otp:verify:${challengeId}`;
  const count = getMemoryCount(key, 900, now); // 15 minute challenge window

  const decision = evaluateFixedWindow(count - 1, policy, now);
  if (!decision.allowed) {
    return {
      allowed: false,
      error:
        "Maximum verification attempts exceeded for this code. Please request a new code.",
    };
  }

  return { allowed: true };
}
