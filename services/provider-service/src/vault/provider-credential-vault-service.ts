import { createPublicId } from "@growx/ids";
import {
  GrowXProviderError,
  type CreateProviderCredentialRequestV2,
  type CreateProviderCredentialVersionRequest,
  type RotateProviderCredentialRequestV2,
  type ProviderCredential,
  type ProviderCredentialVersion,
} from "@growx/contracts";
import { generateSecretFingerprint, type SecretProvider } from "./secret-provider.js";
import type { IProviderRepository } from "../application/repository.js";
import type { IProviderEvents } from "../application/events.js";
import type { ProviderCredentialResolver } from "./credential-resolver.js";

export class ProviderCredentialVaultService {
  constructor(
    private readonly repository: IProviderRepository,
    private readonly secretProvider: SecretProvider,
    private readonly events: IProviderEvents,
    private readonly resolver?: ProviderCredentialResolver | undefined
  ) {}

  public async createCredential(
    providerAccountId: string,
    input: CreateProviderCredentialRequestV2,
    operatorId: string,
    requestId?: string
  ): Promise<{ credential: ProviderCredential; version: ProviderCredentialVersion }> {
    const account = await this.repository.getAccountById(providerAccountId);
    if (!account) {
      throw new GrowXProviderError("provider_invalid_request", `Provider account '${providerAccountId}' not found`, false, 404);
    }

    const now = new Date();
    const credentialId = `pcred_${createPublicId("key").slice(4)}`;
    const versionId = `pcver_${createPublicId("key").slice(4)}`;
    const secretRef = `vault/${account.providerId}/${account.id}/${credentialId}/v1`;
    const fingerprint = generateSecretFingerprint(input.rawSecret);

    // 1. Write secret payload to SecretProvider vault
    await this.secretProvider.putSecret(secretRef, input.rawSecret, {
      credentialId,
      version: 1,
      environment: input.environment,
    });

    // 2. Create Credential Version Record (write-only, zero raw secret stored in DB)
    const version: ProviderCredentialVersion = {
      id: versionId,
      credentialId,
      version: 1,
      secretReference: secretRef,
      keyFingerprint: fingerprint,
      status: input.autoActivate ? "active" : "pending",
      validationStatus: "valid",
      validatedAt: now,
      ...(input.autoActivate ? { activatedAt: now } : {}),
      ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
      metadata: input.metadata || {},
      createdAt: now,
    };

    await this.repository.createCredentialVersion(version);

    // 3. Create Credential Record
    const credential: ProviderCredential = {
      id: credentialId,
      providerAccountId: account.id,
      providerId: account.providerId,
      name: input.name,
      credentialType: input.credentialType || "api_key",
      status: "active",
      activeVersionId: input.autoActivate ? versionId : undefined,
      environment: input.environment || "production",
      createdAt: now,
      updatedAt: now,
      ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
      metadata: input.metadata || {},
    };

    const createdCredential = await this.repository.createCredentialV2(credential);

    await this.events.emitSecurityEvent(
      "provider.credential.created",
      { credentialId, accountId: account.id, versionId, fingerprint },
      requestId
    );

    return { credential: createdCredential, version };
  }

  public async createVersion(
    credentialId: string,
    input: CreateProviderCredentialVersionRequest,
    operatorId: string,
    requestId?: string
  ): Promise<ProviderCredentialVersion> {
    const credential = await this.repository.getCredentialById(credentialId);
    if (!credential) {
      throw new GrowXProviderError("provider_invalid_request", `Provider credential '${credentialId}' not found`, false, 404);
    }

    const versions = await this.repository.listCredentialVersions(credentialId);
    const nextVersionNum = versions.length > 0 ? Math.max(...versions.map(v => v.version)) + 1 : 1;

    const now = new Date();
    const versionId = `pcver_${createPublicId("key").slice(4)}`;
    const secretRef = `vault/${credential.providerId || "prov"}/${credential.providerAccountId || "pacc"}/${credentialId}/v${nextVersionNum}`;
    const fingerprint = generateSecretFingerprint(input.rawSecret);

    // Put secret in vault
    await this.secretProvider.putSecret(secretRef, input.rawSecret, {
      credentialId,
      version: nextVersionNum,
    });

    const version: ProviderCredentialVersion = {
      id: versionId,
      credentialId,
      version: nextVersionNum,
      secretReference: secretRef,
      keyFingerprint: fingerprint,
      status: input.autoActivate ? "active" : "pending",
      validationStatus: "valid",
      validatedAt: now,
      ...(input.autoActivate ? { activatedAt: now } : {}),
      ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
      metadata: input.metadata || {},
      createdAt: now,
    };

    const createdVersion = await this.repository.createCredentialVersion(version);

    if (input.autoActivate) {
      await this.activateVersion(versionId, operatorId, requestId);
    } else {
      await this.events.emitSecurityEvent(
        "provider.credential.version_created",
        { credentialId, versionId, version: nextVersionNum, fingerprint },
        requestId
      );
    }

    return createdVersion;
  }

  public async activateVersion(
    versionId: string,
    operatorId: string,
    requestId?: string
  ): Promise<{ activatedVersion: ProviderCredentialVersion; previousActiveVersion?: ProviderCredentialVersion | undefined }> {
    const version = await this.repository.getCredentialVersionById(versionId);
    if (!version) {
      throw new GrowXProviderError("provider_invalid_request", `Credential version '${versionId}' not found`, false, 404);
    }

    const credential = await this.repository.getCredentialById(version.credentialId);
    if (!credential) {
      throw new GrowXProviderError("provider_invalid_request", `Credential '${version.credentialId}' not found`, false, 404);
    }

    const now = new Date();
    let previousActive: ProviderCredentialVersion | undefined;

    // 1. Drain/retire previous active version
    if (credential.activeVersionId && credential.activeVersionId !== versionId) {
      const prev = await this.repository.getCredentialVersionById(credential.activeVersionId);
      if (prev && prev.status === "active") {
        previousActive = await this.repository.updateCredentialVersion(prev.id, {
          status: "draining",
          retiredAt: now,
        });
      }
    }

    // 2. Activate new version
    const activatedVersion = await this.repository.updateCredentialVersion(versionId, {
      status: "active",
      activatedAt: now,
    });

    // 3. Update active version on parent credential
    await this.repository.updateCredential(credential.id, {
      activeVersionId: versionId,
      rotatedAt: now,
      updatedAt: now,
    });

    // 4. Invalidate resolver cache
    this.resolver?.invalidate(credential.id);

    await this.events.emitSecurityEvent(
      "provider.credential.activated",
      { credentialId: credential.id, versionId, previousVersionId: previousActive?.id },
      requestId
    );

    return { activatedVersion, previousActiveVersion: previousActive };
  }

  public async rotateCredential(
    credentialId: string,
    input: RotateProviderCredentialRequestV2,
    operatorId: string,
    requestId?: string
  ): Promise<{ newVersion: ProviderCredentialVersion; retiredVersion?: ProviderCredentialVersion | undefined }> {
    const credential = await this.repository.getCredentialById(credentialId);
    if (!credential) {
      throw new GrowXProviderError("provider_invalid_request", `Provider credential '${credentialId}' not found`, false, 404);
    }

    // Create new version with automatic activation
    const newVersion = await this.createVersion(
      credentialId,
      {
        rawSecret: input.newRawSecret,
        autoActivate: true,
        validateBeforeActivation: input.validateBeforeActivation ?? true,
        ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
        metadata: { rotationReason: input.reason },
      },
      operatorId,
      requestId
    );

    await this.events.emitSecurityEvent(
      "provider.credential.rotated",
      { credentialId, newVersionId: newVersion.id, reason: input.reason },
      requestId
    );

    return { newVersion };
  }

  public async rollbackVersion(
    credentialId: string,
    targetVersionId: string,
    operatorId: string,
    requestId?: string
  ): Promise<ProviderCredentialVersion> {
    const target = await this.repository.getCredentialVersionById(targetVersionId);
    if (!target || target.credentialId !== credentialId) {
      throw new GrowXProviderError("provider_invalid_request", `Target version '${targetVersionId}' does not belong to credential '${credentialId}'`, false, 400);
    }

    const { activatedVersion } = await this.activateVersion(targetVersionId, operatorId, requestId);
    return activatedVersion;
  }

  public async emergencyRevoke(
    credentialId: string,
    reason: string,
    operatorId: string,
    requestId?: string
  ): Promise<ProviderCredential> {
    const credential = await this.repository.getCredentialById(credentialId);
    if (!credential) {
      throw new GrowXProviderError("provider_invalid_request", `Provider credential '${credentialId}' not found`, false, 404);
    }

    const now = new Date();
    const updated = await this.repository.updateCredential(credentialId, {
      status: "revoked",
      disabledAt: now,
      updatedAt: now,
    });

    // Invalidate resolver cache immediately
    this.resolver?.invalidate(credentialId);

    await this.events.emitSecurityEvent(
      "provider.credential.revoked",
      { credentialId, reason, operatorId },
      requestId
    );

    return updated as unknown as ProviderCredential;
  }

  public async checkExpiringCredentials(windowDays = 14): Promise<ProviderCredential[]> {
    const threshold = new Date(Date.now() + windowDays * 24 * 60 * 60 * 1000);
    return this.repository.listExpiringCredentials(threshold);
  }
}
