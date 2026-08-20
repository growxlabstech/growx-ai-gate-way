import crypto from "node:crypto";
import { decryptSecret, encryptSecret } from "@growx/cryptography";
import { GrowXProviderError } from "@growx/contracts";

export interface SecretProviderHealth {
  status: "healthy" | "degraded" | "unhealthy";
  latencyMs?: number | undefined;
  details?: Record<string, unknown> | undefined;
}

export interface SecretProvider {
  putSecret(reference: string, payload: string, metadata?: Record<string, unknown>): Promise<void>;
  getSecret(reference: string): Promise<string | null>;
  deleteSecret(reference: string): Promise<void>;
  health(): Promise<SecretProviderHealth>;
}

export function generateSecretFingerprint(secret: string): string {
  if (!secret) return "unknown";
  const trimmed = secret.trim();
  const last4 = trimmed.length > 4 ? trimmed.slice(-4) : trimmed;
  const hash = crypto.createHash("sha256").update(trimmed).digest("hex").slice(0, 8);
  const prefix = trimmed.startsWith("sk-") ? "sk-..." : trimmed.startsWith("gsk_") ? "gsk_..." : "sec_...";
  return `${prefix}${last4}#${hash}`;
}

export class InMemorySecretProvider implements SecretProvider {
  private secrets = new Map<string, { payload: string; metadata?: Record<string, unknown> | undefined }>();

  public async putSecret(
    reference: string,
    payload: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    this.secrets.set(reference, {
      payload,
      ...(metadata ? { metadata } : {}),
    });
  }

  public async getSecret(reference: string): Promise<string | null> {
    const item = this.secrets.get(reference);
    return item ? item.payload : null;
  }

  public async deleteSecret(reference: string): Promise<void> {
    this.secrets.delete(reference);
  }

  public async health(): Promise<SecretProviderHealth> {
    return { status: "healthy", latencyMs: 0, details: { count: this.secrets.size, backend: "in-memory" } };
  }

  public clear(): void {
    this.secrets.clear();
  }
}

export class EnvelopeEncryptionSecretProvider implements SecretProvider {
  private readonly masterKey: Buffer;
  private readonly keyVersion: string;
  private storage = new Map<string, { encryptedPayload: string; keyVersion: string; metadata?: Record<string, unknown> | undefined }>();

  constructor(key?: Buffer | string, keyVersion = "v1") {
    this.keyVersion = keyVersion;
    if (key) {
      this.masterKey = typeof key === "string" ? Buffer.from(key, "hex") : key;
    } else {
      const rawEnv =
        process.env.PROVIDER_ENCRYPTION_KEY ||
        process.env.CREDENTIAL_ENCRYPTION_KEY ||
        process.env.GATEWAY_ENCRYPTION_KEY;

      if (!rawEnv) {
        if (process.env.NODE_ENV === "production") {
          throw new GrowXProviderError(
            "provider_server_error",
            "Missing PROVIDER_ENCRYPTION_KEY in production environment",
            false,
            500
          );
        }
        this.masterKey = Buffer.from("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef", "hex");
      } else {
        this.masterKey = Buffer.from(rawEnv, rawEnv.length === 64 ? "hex" : "utf8");
      }
    }

    if (this.masterKey.length !== 32) {
      throw new GrowXProviderError(
        "provider_server_error",
        `Provider encryption master key must be 32 bytes. Received: ${this.masterKey.length} bytes`,
        false,
        500
      );
    }
  }

  public async putSecret(
    reference: string,
    payload: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    try {
      const encryptedPayload = encryptSecret(payload, this.masterKey);
      this.storage.set(reference, {
        encryptedPayload,
        keyVersion: this.keyVersion,
        ...(metadata ? { metadata } : {}),
      });
    } catch (err) {
      throw new GrowXProviderError(
        "provider_server_error",
        "Failed to encrypt and store secret in vault",
        false,
        500,
        { cause: err }
      );
    }
  }

  public async getSecret(reference: string): Promise<string | null> {
    const item = this.storage.get(reference);
    if (!item) return null;
    try {
      return decryptSecret(item.encryptedPayload, this.masterKey);
    } catch (err) {
      throw new GrowXProviderError(
        "provider_server_error",
        "Failed to decrypt vault secret",
        false,
        500,
        { cause: err }
      );
    }
  }

  public async deleteSecret(reference: string): Promise<void> {
    this.storage.delete(reference);
  }

  public async health(): Promise<SecretProviderHealth> {
    const start = Date.now();
    try {
      const testVal = "probe_payload";
      const encrypted = encryptSecret(testVal, this.masterKey);
      const decrypted = decryptSecret(encrypted, this.masterKey);
      if (decrypted !== testVal) {
        return { status: "unhealthy", latencyMs: Date.now() - start, details: { reason: "crypto_mismatch" } };
      }
      return { status: "healthy", latencyMs: Date.now() - start, details: { count: this.storage.size, backend: "envelope_aes256_gcm" } };
    } catch (err) {
      return { status: "unhealthy", latencyMs: Date.now() - start, details: { error: String(err) } };
    }
  }
}

export class LegacyEnvCredentialAdapter {
  public static getLegacySecret(providerId: string): string | null {
    const envKey = `${providerId.toUpperCase()}_API_KEY`;
    const secret = process.env[envKey];
    return secret || null;
  }
}
