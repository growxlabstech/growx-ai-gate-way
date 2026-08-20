import { createHmac, timingSafeEqual } from "node:crypto";

export const packageName = "@growx/service-auth" as const;

export interface ServiceTokenPayload {
  serviceName: string;
  issuedAt: number;
  environment?: string;
  metadata?: Record<string, unknown>;
}

export function generateServiceToken(
  serviceName: string,
  secret: string,
  environment = "development"
): string {
  const issuedAt = Math.floor(Date.now() / 1000);
  const payloadStr = JSON.stringify({ serviceName, issuedAt, environment });
  const payloadBase64 = Buffer.from(payloadStr, "utf8").toString("base64url");

  const hmac = createHmac("sha256", secret).update(payloadBase64).digest("base64url");
  return `${payloadBase64}.${hmac}`;
}

export function verifyServiceToken(
  token: string,
  secret: string,
  allowedClockSkewSeconds = 300
): ServiceTokenPayload {
  const parts = token.split(".");
  if (parts.length !== 2) {
    throw new Error("Invalid service token format");
  }

  const payloadBase64 = parts[0] ?? "";
  const providedHmac = parts[1] ?? "";

  if (!payloadBase64 || !providedHmac) {
    throw new Error("Invalid service token parts");
  }

  const expectedHmac = createHmac("sha256", secret).update(payloadBase64).digest("base64url");

  const providedBuf = Buffer.from(providedHmac, "utf8");
  const expectedBuf = Buffer.from(expectedHmac, "utf8");

  if (providedBuf.length !== expectedBuf.length || !timingSafeEqual(providedBuf, expectedBuf)) {
    throw new Error("Service token signature verification failed");
  }

  const payloadJson = Buffer.from(payloadBase64, "base64url").toString("utf8");
  const payload = JSON.parse(payloadJson) as ServiceTokenPayload;

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - payload.issuedAt) > allowedClockSkewSeconds) {
    throw new Error("Service token expired or timestamp outside allowed window");
  }

  return payload;
}
