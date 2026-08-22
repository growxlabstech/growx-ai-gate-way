import { randomBytes } from "node:crypto";

export type ApiKeyEnvironment =
  "development" | "staging" | "production" | "custom";

export function generateApiKeyIdentifier(): string {
  const hex = randomBytes(16).toString("hex");
  return `key_${hex}`;
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
  const secretPart = randomBytes(24).toString("base64url");
  const fullSecret = `${prefix}_${secretPart}`;
  return { id, prefix, secretPart, fullSecret };
}

export function publicPrefix(
  environment: ApiKeyEnvironment,
  id: string,
): string {
  const envPrefix = environment === "production" ? "gx_live" : "gx_test";
  return `${envPrefix}_${id}_••••••••••••`;
}

export function maskApiKey(value: string): string {
  if (!value) return "••••••••";
  if (value.length <= 16) return "••••••••";
  return `${value.slice(0, 16)}••••••••••••`;
}
