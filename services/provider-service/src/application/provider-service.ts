import {
  type CreateProviderCredentialRequest,
  type CreateProviderRequest,
  GrowXProviderError,
  type NormalizedGenerationRequest,
  type NormalizedGenerationResponse,
  type NormalizedStreamEvent,
  type ProviderExecutionContext,
  type RotateProviderCredentialRequest,
  type UpdateProviderRequest,
} from "@growx/contracts";
import { createPublicId } from "@growx/ids";
import type { AdapterRegistry } from "@growx/provider-sdk";
import { validateRequestCapabilities } from "../domain/capability-validator.js";
import { validateProviderBaseUrl } from "../domain/ssrf-validator.js";
import type {
  ProviderCredentialEntity,
  ProviderEntity,
  ResolvedExecutionRoute,
} from "../domain/types.js";
import type { ProviderCredentialCrypto } from "./credential-crypto.js";
import type { IProviderEvents } from "./events.js";
import type { IProviderRepository, ProviderListFilter } from "./repository.js";

export class ProviderService {
  constructor(
    private readonly repository: IProviderRepository,
    private readonly events: IProviderEvents,
    private readonly crypto: ProviderCredentialCrypto,
    private readonly adapterRegistry: AdapterRegistry
  ) {}

  // -------------------------------------------------------------
  // Provider Operations
  // -------------------------------------------------------------

  async createProvider(
    input: CreateProviderRequest,
    operatorId: string,
    requestId?: string
  ): Promise<ProviderEntity> {
    const existing = await this.repository.getProviderByCode(input.code);
    if (existing) {
      throw new GrowXProviderError(
        "provider_invalid_request",
        `Provider with code '${input.code}' already exists`,
        false,
        409
      );
    }

    validateProviderBaseUrl(input.baseUrl);

    const now = new Date();
    const provider: ProviderEntity = {
      id: createPublicId("prov"),
      code: input.code.toLowerCase(),
      displayName: input.displayName,
      adapterType: input.adapterType.toLowerCase(),
      baseUrl: input.baseUrl,
      apiVersion: input.apiVersion ?? null,
      region: input.region ?? "global",
      priority: input.priority ?? 100,
      enabled: input.enabled ?? true,
      status: input.status ?? "active",
      metadata: input.metadata ?? {},
      createdAt: now,
      updatedAt: now,
    };

    const created = await this.repository.createProvider(provider);
    await this.events.emitProviderCreated(created, operatorId, requestId);
    return created;
  }

  async updateProvider(
    idOrCode: string,
    input: UpdateProviderRequest,
    operatorId: string,
    requestId?: string
  ): Promise<ProviderEntity> {
    const current = await this.getProvider(idOrCode);

    if (input.baseUrl) {
      validateProviderBaseUrl(input.baseUrl);
    }

    const updates: Partial<ProviderEntity> = {};
    if (input.displayName !== undefined) updates.displayName = input.displayName;
    if (input.adapterType !== undefined) updates.adapterType = input.adapterType.toLowerCase();
    if (input.baseUrl !== undefined) updates.baseUrl = input.baseUrl;
    if (input.apiVersion !== undefined) updates.apiVersion = input.apiVersion;
    if (input.region !== undefined) updates.region = input.region;
    if (input.priority !== undefined) updates.priority = input.priority;
    if (input.enabled !== undefined) updates.enabled = input.enabled;
    if (input.status !== undefined) updates.status = input.status;
    if (input.metadata !== undefined) updates.metadata = input.metadata;
    updates.updatedAt = new Date();

    const updated = await this.repository.updateProvider(current.id, updates);
    await this.events.emitProviderUpdated(updated, operatorId, requestId);
    return updated;
  }

  async disableProvider(
    idOrCode: string,
    operatorId: string,
    requestId?: string
  ): Promise<ProviderEntity> {
    const current = await this.getProvider(idOrCode);
    const updated = await this.repository.updateProvider(current.id, {
      status: "disabled",
      enabled: false,
      updatedAt: new Date(),
    });

    await this.events.emitProviderDisabled(updated.id, operatorId, requestId);
    return updated;
  }

  async enableProvider(
    idOrCode: string,
    operatorId: string,
    requestId?: string
  ): Promise<ProviderEntity> {
    const current = await this.getProvider(idOrCode);
    const updated = await this.repository.updateProvider(current.id, {
      status: "active",
      enabled: true,
      updatedAt: new Date(),
    });

    await this.events.emitProviderEnabled(updated.id, operatorId, requestId);
    return updated;
  }

  async getProvider(idOrCode: string): Promise<ProviderEntity> {
    let provider = await this.repository.getProviderById(idOrCode);
    if (!provider) {
      provider = await this.repository.getProviderByCode(idOrCode);
    }
    if (!provider) {
      throw new GrowXProviderError(
        "model_not_found",
        `Provider '${idOrCode}' not found`,
        false,
        404
      );
    }
    return provider;
  }

  async listProviders(filter?: ProviderListFilter): Promise<ProviderEntity[]> {
    return this.repository.listProviders(filter);
  }

  // -------------------------------------------------------------
  // Provider Credential Operations
  // -------------------------------------------------------------

  async createCredential(
    providerIdOrCode: string,
    input: CreateProviderCredentialRequest,
    operatorId: string,
    requestId?: string
  ): Promise<ProviderCredentialEntity> {
    const provider = await this.getProvider(providerIdOrCode);

    const { encryptedPayload, keyVersion } = this.crypto.encrypt(input.rawSecret);

    const now = new Date();
    const credential: ProviderCredentialEntity = {
      id: `pcred_${createPublicId("key").slice(4)}`,
      providerId: provider.id,
      name: input.name,
      environment: input.environment ?? "production",
      encryptedPayload,
      encryptionKeyVersion: keyVersion,
      status: "active",
      metadata: input.metadata ?? {},
      createdAt: now,
      updatedAt: now,
    };

    const created = await this.repository.createCredential(credential);
    await this.events.emitCredentialCreated(created, operatorId, requestId);
    return created;
  }

  async rotateCredential(
    credentialId: string,
    input: RotateProviderCredentialRequest,
    operatorId: string,
    requestId?: string
  ): Promise<ProviderCredentialEntity> {
    const current = await this.repository.getCredentialById(credentialId);
    if (!current) {
      throw new GrowXProviderError(
        "model_not_found",
        `Provider credential '${credentialId}' not found`,
        false,
        404
      );
    }

    const { encryptedPayload, keyVersion } = this.crypto.encrypt(input.newRawSecret);
    const now = new Date();

    const updated = await this.repository.updateCredential(credentialId, {
      encryptedPayload,
      encryptionKeyVersion: keyVersion,
      status: "active",
      rotatedAt: now,
      updatedAt: now,
      metadata: {
        ...current.metadata,
        rotationReason: input.reason ?? "Scheduled rotation",
      },
    });

    await this.events.emitCredentialRotated(updated, current.id, operatorId, requestId);
    return updated;
  }

  async disableCredential(
    credentialId: string,
    operatorId: string,
    requestId?: string
  ): Promise<ProviderCredentialEntity> {
    const current = await this.repository.getCredentialById(credentialId);
    if (!current) {
      throw new GrowXProviderError(
        "model_not_found",
        `Provider credential '${credentialId}' not found`,
        false,
        404
      );
    }

    const now = new Date();
    const updated = await this.repository.updateCredential(credentialId, {
      status: "disabled",
      disabledAt: now,
      updatedAt: now,
    });

    await this.events.emitCredentialDisabled(updated.id, operatorId, requestId);
    return updated;
  }

  async listCredentials(providerIdOrCode: string): Promise<ProviderCredentialEntity[]> {
    const provider = await this.getProvider(providerIdOrCode);
    return this.repository.listCredentialsByProviderId(provider.id);
  }

  // -------------------------------------------------------------
  // Provider Execution Runtime
  // -------------------------------------------------------------

  private async prepareExecutionContext(
    route: ResolvedExecutionRoute,
    request: NormalizedGenerationRequest,
    callerContext?: Partial<ProviderExecutionContext>
  ): Promise<{ context: ProviderExecutionContext; provider: ProviderEntity }> {
    // 1. Resolve Provider
    const provider = await this.getProvider(route.providerId);

    if (provider.status === "disabled" || !provider.enabled) {
      throw new GrowXProviderError(
        "provider_unavailable",
        `Provider '${provider.code}' is currently disabled`,
        false,
        503
      );
    }

    if (provider.status === "maintenance") {
      throw new GrowXProviderError(
        "provider_unavailable",
        `Provider '${provider.code}' is undergoing maintenance`,
        true,
        503
      );
    }

    if (provider.status === "retired") {
      throw new GrowXProviderError(
        "model_retired",
        `Provider '${provider.code}' has been retired`,
        false,
        410
      );
    }

    // 2. Validate SSRF Base URL
    try {
      validateProviderBaseUrl(provider.baseUrl);
    } catch (err) {
      await this.events.emitSecurityEvent(
        "security.provider.ssrf_blocked",
        { providerId: provider.id, baseUrl: provider.baseUrl },
        request.requestId
      );
      throw err;
    }

    // 3. Resolve Credential
    const credential = await this.repository.getEffectiveCredential(
      provider.id,
      callerContext?.organizationId ? "production" : undefined,
      route.credentialId
    );

    if (!credential) {
      throw new GrowXProviderError(
        "provider_authentication_error",
        `No active credentials configured for provider '${provider.code}'`,
        false,
        502
      );
    }

    if (credential.status === "disabled" || credential.status === "revoked") {
      throw new GrowXProviderError(
        "provider_authentication_error",
        `Provider credential for '${provider.code}' is ${credential.status}`,
        false,
        502
      );
    }

    // 4. Validate Credential Scope
    if (credential.providerId !== provider.id) {
      await this.events.emitSecurityEvent(
        "security.provider.invalid_credential_scope",
        {
          credentialProviderId: credential.providerId,
          targetProviderId: provider.id,
        },
        request.requestId
      );
      throw new GrowXProviderError(
        "provider_authentication_error",
        "Credential scope mismatch for provider execution",
        false,
        502
      );
    }

    // 5. Decrypt Credential JIT
    let decryptedSecret = "";
    try {
      decryptedSecret = this.crypto.decrypt(
        credential.encryptedPayload,
        credential.encryptionKeyVersion
      );
    } catch (err) {
      await this.events.emitSecurityEvent(
        "security.provider.decryption_failed",
        { credentialId: credential.id, providerId: provider.id },
        request.requestId
      );
      throw err;
    }

    // 6. Capability Validation
    validateRequestCapabilities(request, route.capabilities);

    const timeoutMs = request.timeoutMs ?? callerContext?.timeoutMs ?? 60_000;

    const executionContext: ProviderExecutionContext = {
      requestId: request.requestId,
      providerId: provider.id,
      providerRouteId: route.providerModelId,
      credentialId: credential.id,
      canonicalModelId: request.canonicalModelId,
      providerModelId: route.providerModelId,
      timeoutMs,
      decryptedCredential: decryptedSecret,
      ...(callerContext?.organizationId ? { organizationId: callerContext.organizationId } : {}),
      ...(callerContext?.workspaceId ? { workspaceId: callerContext.workspaceId } : {}),
      ...(callerContext?.apiKeyId ? { apiKeyId: callerContext.apiKeyId } : {}),
      ...(callerContext?.traceContext ? { traceContext: callerContext.traceContext } : {}),
      ...(callerContext?.cancellationSignal ? { cancellationSignal: callerContext.cancellationSignal } : {}),
    };

    // Attach baseUrl for the adapter
    (executionContext as unknown as Record<string, unknown>).baseUrl = provider.baseUrl;

    return { context: executionContext, provider };
  }

  async executeRoute(
    route: ResolvedExecutionRoute,
    request: NormalizedGenerationRequest,
    callerContext?: Partial<ProviderExecutionContext>
  ): Promise<NormalizedGenerationResponse> {
    const { context, provider } = await this.prepareExecutionContext(
      route,
      request,
      callerContext
    );

    const adapter = this.adapterRegistry.get(provider.adapterType || provider.code);

    try {
      const response = await adapter.execute(request, context);
      response.providerId = route.providerId;
      return response;
    } finally {
      // Discard plaintext credential reference
      delete (context as unknown as Record<string, unknown>).decryptedCredential;
    }
  }

  async *streamRoute(
    route: ResolvedExecutionRoute,
    request: NormalizedGenerationRequest,
    callerContext?: Partial<ProviderExecutionContext>
  ): AsyncIterable<NormalizedStreamEvent> {
    const { context, provider } = await this.prepareExecutionContext(
      route,
      request,
      callerContext
    );

    const adapter = this.adapterRegistry.get(provider.adapterType || provider.code);

    try {
      for await (const event of adapter.stream(request, context)) {
        if (event.type === "response.completed" && event.response) {
          event.response.providerId = route.providerId;
        }
        yield event;
      }
    } finally {
      // Discard plaintext credential reference
      delete (context as unknown as Record<string, unknown>).decryptedCredential;
    }
  }
}
