import {
  GrowXProviderError,
  type ExecutionTarget,
  type ResolvedProviderCredential,
} from "@growx/contracts";
import type { SecretProvider } from "./secret-provider.js";
import type { IProviderRepository } from "../application/repository.js";

export interface CredentialCacheEntry {
  credential: ResolvedProviderCredential;
  expiresAtMs: number;
}

export class ProviderCredentialResolver {
  private cache = new Map<string, CredentialCacheEntry>();
  private readonly ttlMs: number;
  private readonly maxCacheSize: number;

  constructor(
    private readonly secretProvider: SecretProvider,
    private readonly repository: IProviderRepository,
    options: {
      ttlMs?: number | undefined;
      maxCacheSize?: number | undefined;
    } = {},
  ) {
    this.ttlMs = options.ttlMs ?? 60_000; // 60 seconds TTL
    this.maxCacheSize = options.maxCacheSize ?? 1000;
  }

  public async resolve(
    target: ExecutionTarget,
    callerContext?: { isInternalExecution?: boolean | undefined },
  ): Promise<ResolvedProviderCredential> {
    // Only internal execution service is authorized to resolve provider credentials
    if (callerContext?.isInternalExecution === false) {
      throw new GrowXProviderError(
        "provider_authentication_error",
        "Unauthorized caller cannot resolve provider credential secrets",
        false,
        403,
      );
    }

    const cacheKey = `${target.providerAccountId}:${target.credentialId}`;
    const cached = this.cache.get(cacheKey);
    const now = Date.now();

    if (cached && cached.expiresAtMs > now) {
      return cached.credential;
    }

    // Lookup credential metadata
    const credential = await this.repository.getCredentialById(
      target.credentialId,
    );
    if (!credential) {
      throw new GrowXProviderError(
        "provider_authentication_error",
        `Provider credential '${target.credentialId}' not found`,
        false,
        404,
      );
    }

    if (credential.status === "disabled" || credential.status === "revoked") {
      throw new GrowXProviderError(
        "provider_authentication_error",
        `Provider credential '${target.credentialId}' is ${credential.status}`,
        false,
        502,
      );
    }

    // Resolve active version
    const versionId = target.credentialVersionId || credential.activeVersionId;
    const versionRecord = versionId
      ? await this.repository.getCredentialVersionById?.(versionId)
      : await this.repository.getActiveCredentialVersion?.(credential.id);

    const secretRef =
      versionRecord?.secretReference || credential.encryptedPayload;
    if (!secretRef) {
      throw new GrowXProviderError(
        "provider_authentication_error",
        `No secret reference available for credential '${credential.id}'`,
        false,
        502,
      );
    }

    // Fetch decrypted secret from SecretProvider
    const rawSecret = await this.secretProvider.getSecret(secretRef);
    if (!rawSecret) {
      throw new GrowXProviderError(
        "provider_authentication_error",
        `Failed to resolve secret from vault for credential '${credential.id}'`,
        false,
        502,
      );
    }

    const resolved: ResolvedProviderCredential = {
      providerId: target.providerId,
      accountId: target.providerAccountId,
      credentialId: credential.id,
      credentialVersionId: versionRecord?.id || "v1",
      credentialType: (credential.credentialType as any) || "api_key",
      secret: rawSecret,
      version: versionRecord?.version || 1,
    };

    // Cache with bounded size
    if (this.cache.size >= this.maxCacheSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
    }

    this.cache.set(cacheKey, {
      credential: resolved,
      expiresAtMs: now + this.ttlMs,
    });

    return resolved;
  }

  public invalidate(credentialId: string): void {
    for (const [key, entry] of this.cache.entries()) {
      if (entry.credential.credentialId === credentialId) {
        this.cache.delete(key);
      }
    }
  }

  public invalidateAccount(providerAccountId: string): void {
    for (const [key, entry] of this.cache.entries()) {
      if (entry.credential.accountId === providerAccountId) {
        this.cache.delete(key);
      }
    }
  }

  public invalidateAll(): void {
    this.cache.clear();
  }
}
