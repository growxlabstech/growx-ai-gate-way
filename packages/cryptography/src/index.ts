import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

const B64URL = /^[A-Za-z0-9_-]+$/;
export function secureRandom(bytes = 32): string {
  if (!Number.isSafeInteger(bytes) || bytes < 16 || bytes > 1024)
    throw new RangeError("bytes must be an integer between 16 and 1024");
  return randomBytes(bytes).toString("hex");
}
export function hashApiKey(secret: string, pepper: string): string {
  if (secret.length < 20 || !B64URL.test(secret))
    throw new Error("API key secret is malformed");
  if (Buffer.byteLength(pepper) < 32)
    throw new Error("API key pepper must contain at least 32 bytes");
  return createHmac("sha256", pepper)
    .update(secret, "utf8")
    .digest("base64url");
}
export function constantTimeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) {
    timingSafeEqual(a, a);
    return false;
  }
  return timingSafeEqual(a, b);
}
export function verifyApiKey(
  secret: string,
  storedHash: string,
  pepper: string,
): boolean {
  try {
    return constantTimeEqual(hashApiKey(secret, pepper), storedHash);
  } catch {
    return false;
  }
}
export function hashToken(token: string, pepper: string): string {
  if (!token) throw new Error("Token is required");
  return createHmac("sha256", pepper).update(token).digest("base64url");
}
export function encryptSecret(plaintext: string, key: Buffer): string {
  if (key.length !== 32) throw new Error("Encryption key must be 32 bytes");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${ciphertext.toString("base64url")}`;
}
export function decryptSecret(envelope: string, key: Buffer): string {
  if (key.length !== 32) throw new Error("Encryption key must be 32 bytes");
  const parts = envelope.split(".");
  if (parts.length !== 3) throw new Error("Encrypted secret is malformed");
  const iv = Buffer.from(parts[0]!, "base64url");
  const tag = Buffer.from(parts[1]!, "base64url");
  const ciphertext = Buffer.from(parts[2]!, "base64url");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
}
