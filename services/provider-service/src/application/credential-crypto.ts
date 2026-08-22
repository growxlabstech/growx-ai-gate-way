import { decryptSecret, encryptSecret } from "@growx/cryptography";
import { GrowXProviderError } from "@growx/contracts";

export class ProviderCredentialCrypto {
  private readonly masterKey: Buffer;
  private readonly keyVersion: string;

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
            500,
          );
        }
        // Test/Development fallback key (32 bytes = 64 hex chars)
        this.masterKey = Buffer.from(
          "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
          "hex",
        );
      } else {
        this.masterKey = Buffer.from(
          rawEnv,
          rawEnv.length === 64 ? "hex" : "utf8",
        );
      }
    }

    if (this.masterKey.length !== 32) {
      throw new GrowXProviderError(
        "provider_server_error",
        `Provider encryption master key must be exactly 32 bytes. Received: ${this.masterKey.length} bytes`,
        false,
        500,
      );
    }
  }

  encrypt(plaintext: string): { encryptedPayload: string; keyVersion: string } {
    try {
      const encryptedPayload = encryptSecret(plaintext, this.masterKey);
      return {
        encryptedPayload,
        keyVersion: this.keyVersion,
      };
    } catch (err) {
      throw new GrowXProviderError(
        "provider_server_error",
        "Failed to encrypt provider credential",
        false,
        500,
        { cause: err },
      );
    }
  }

  decrypt(
    encryptedPayload: string,
    _encryptionKeyVersion?: number | string,
  ): string {
    try {
      return decryptSecret(encryptedPayload, this.masterKey);
    } catch (err) {
      throw new GrowXProviderError(
        "provider_server_error",
        "Failed to decrypt provider credential payload",
        false,
        500,
        { cause: err },
      );
    }
  }
}
