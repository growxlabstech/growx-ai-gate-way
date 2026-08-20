import { secureRandom, hashApiKey, verifyApiKey, constantTimeEqual } from "@growx/cryptography";
import type { ApiKeyEnvironment } from "./types.js";

const keyIdPattern = /^key_[a-f0-9]{32}$/;
const encodedPattern = /^gx_(live|test)_((?:key_)[a-f0-9]{32})_([A-Za-z0-9_-]{20,256})$/;

export interface ParsedApiKey {
  environment: "production" | "development";
  rawEnvironment: "live" | "test";
  keyId: string;
  secret: string;
}

export function parseApiKey(value: string): ParsedApiKey | null {
  if (typeof value !== "string" || value.length > 320) return null;
  const trimmed = value.trim();
  if (trimmed !== value || value.includes("\r") || value.includes("\n") || value.includes(" ")) {
    return null;
  }
  const match = encodedPattern.exec(value);
  if (!match) return null;
  return {
    environment: match[1] === "live" ? "production" : "development",
    rawEnvironment: match[1] as "live" | "test",
    keyId: match[2]!,
    secret: match[3]!,
  };
}

export function generateApiKeyIdentifier(): string {
  const randomHex = secureRandom(16).replace(/[-_]/g, "").slice(0, 32).toLowerCase();
  const id = `key_${randomHex}`;
  if (!keyIdPattern.test(id)) {
    throw new Error("Failed to generate valid key identifier");
  }
  return id;
}

export function generateApiKeyCredentials(environment: ApiKeyEnvironment): {
  id: string;
  prefix: string;
  secretPart: string;
  fullSecret: string;
} {
  const id = generateApiKeyIdentifier();
  const envPrefix = environment === "production" ? "gx_live" : "gx_test";
  const prefix = `${envPrefix}_${id}`;
  const secretPart = secureRandom(32);
  const fullSecret = `${prefix}_${secretPart}`;
  return { id, prefix, secretPart, fullSecret };
}

export function publicPrefix(record: { environment: ApiKeyEnvironment; id: string }): string {
  const envPrefix = record.environment === "production" ? "gx_live" : "gx_test";
  return `${envPrefix}_${record.id}_••••••••••••`;
}

export function maskApiKey(value: string): string {
  if (!value) return "••••••••";
  const parsed = parseApiKey(value);
  if (parsed) {
    const envPrefix = parsed.rawEnvironment === "live" ? "gx_live" : "gx_test";
    return `${envPrefix}_${parsed.keyId}_••••••••••••`;
  }
  const prefixMatch = /^gx_(live|test)_key_[a-f0-9]{32}/.exec(value);
  if (prefixMatch) {
    return `${prefixMatch[0]}_••••••••••••`;
  }
  if (value.startsWith("gx_live_") || value.startsWith("gx_test_")) {
    return value.slice(0, 16) + "••••••••";
  }
  return "••••••••";
}

export { hashApiKey, verifyApiKey, constantTimeEqual };
