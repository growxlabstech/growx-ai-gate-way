import { createPublicId } from "@growx/ids";
import {
  GrowXProviderError,
  type CreateProviderAccountRequest,
  type UpdateProviderAccountRequest,
  type ProviderAccount,
  type ProviderAccountCapability,
  type ProviderAccountLimit,
  type SetAccountCapabilityRequest,
  type SetAccountLimitRequest,
} from "@growx/contracts";
import type { IProviderRepository } from "../application/repository.js";
import type { IProviderEvents } from "../application/events.js";

export class ProviderAccountService {
  constructor(
    private readonly repository: IProviderRepository,
    private readonly events: IProviderEvents,
  ) {}

  public async createAccount(
    providerId: string,
    input: CreateProviderAccountRequest,
    operatorId: string,
    requestId?: string,
  ): Promise<ProviderAccount> {
    const provider = await this.repository.getProviderById(providerId);
    if (!provider) {
      throw new GrowXProviderError(
        "provider_invalid_request",
        `Provider '${providerId}' not found`,
        false,
        404,
      );
    }

    const now = new Date();
    const account: ProviderAccount = {
      id: `pacc_${createPublicId("key").slice(4)}`,
      providerId: provider.id,
      displayName: input.displayName,
      ...(input.externalAccountReference
        ? { externalAccountReference: input.externalAccountReference }
        : {}),
      accountType: input.accountType || "standard",
      status: "active",
      environment: input.environment || "production",
      ...(input.region ? { region: input.region } : {}),
      ...(input.residency ? { residency: input.residency } : {}),
      priority: input.priority ?? 100,
      metadata: input.metadata || {},
      createdAt: now,
      updatedAt: now,
    };

    const created = await this.repository.createAccount(account);
    await this.events.emitSecurityEvent(
      "provider.account.created",
      { accountId: created.id, providerId: provider.id },
      requestId,
    );
    return created;
  }

  public async updateAccount(
    accountId: string,
    input: UpdateProviderAccountRequest,
    operatorId: string,
    requestId?: string,
  ): Promise<ProviderAccount> {
    const existing = await this.repository.getAccountById(accountId);
    if (!existing) {
      throw new GrowXProviderError(
        "provider_invalid_request",
        `Provider account '${accountId}' not found`,
        false,
        404,
      );
    }

    const updates: Partial<ProviderAccount> = {
      ...(input.displayName !== undefined
        ? { displayName: input.displayName }
        : {}),
      ...(input.externalAccountReference !== undefined
        ? { externalAccountReference: input.externalAccountReference }
        : {}),
      ...(input.accountType !== undefined
        ? { accountType: input.accountType }
        : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.region !== undefined ? { region: input.region } : {}),
      ...(input.residency !== undefined ? { residency: input.residency } : {}),
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
      updatedAt: new Date(),
    };

    const updated = await this.repository.updateAccount(accountId, updates);
    await this.events.emitSecurityEvent(
      "provider.account.updated",
      { accountId, updates },
      requestId,
    );
    return updated;
  }

  public async drainAccount(
    accountId: string,
    operatorId: string,
    requestId?: string,
  ): Promise<ProviderAccount> {
    const existing = await this.repository.getAccountById(accountId);
    if (!existing) {
      throw new GrowXProviderError(
        "provider_invalid_request",
        `Provider account '${accountId}' not found`,
        false,
        404,
      );
    }

    const now = new Date();
    const updated = await this.repository.updateAccount(accountId, {
      status: "draining",
      drainingAt: now,
      updatedAt: now,
    });

    await this.events.emitSecurityEvent(
      "provider.account.draining",
      { accountId },
      requestId,
    );
    return updated;
  }

  public async disableAccount(
    accountId: string,
    operatorId: string,
    requestId?: string,
  ): Promise<ProviderAccount> {
    const existing = await this.repository.getAccountById(accountId);
    if (!existing) {
      throw new GrowXProviderError(
        "provider_invalid_request",
        `Provider account '${accountId}' not found`,
        false,
        404,
      );
    }

    const now = new Date();
    const updated = await this.repository.updateAccount(accountId, {
      status: "disabled",
      disabledAt: now,
      updatedAt: now,
    });

    await this.events.emitSecurityEvent(
      "provider.account.disabled",
      { accountId },
      requestId,
    );
    return updated;
  }

  public async enableAccount(
    accountId: string,
    operatorId: string,
    requestId?: string,
  ): Promise<ProviderAccount> {
    const existing = await this.repository.getAccountById(accountId);
    if (!existing) {
      throw new GrowXProviderError(
        "provider_invalid_request",
        `Provider account '${accountId}' not found`,
        false,
        404,
      );
    }

    const updated = await this.repository.updateAccount(accountId, {
      status: "active",
      updatedAt: new Date(),
    });

    return updated;
  }

  public async getAccount(accountId: string): Promise<ProviderAccount> {
    const account = await this.repository.getAccountById(accountId);
    if (!account) {
      throw new GrowXProviderError(
        "provider_invalid_request",
        `Provider account '${accountId}' not found`,
        false,
        404,
      );
    }
    return account;
  }

  public async listAccounts(providerId: string): Promise<ProviderAccount[]> {
    return this.repository.listAccountsByProviderId(providerId);
  }

  // Capability Management
  public async setCapability(
    accountId: string,
    input: SetAccountCapabilityRequest,
  ): Promise<ProviderAccountCapability> {
    const now = new Date();
    const capability: ProviderAccountCapability = {
      id: `pacap_${createPublicId("key").slice(4)}`,
      providerAccountId: accountId,
      ...(input.canonicalModelId
        ? { canonicalModelId: input.canonicalModelId }
        : {}),
      ...(input.providerModelId
        ? { providerModelId: input.providerModelId }
        : {}),
      capability: input.capability,
      enabled: input.enabled ?? true,
      metadata: input.metadata || {},
      createdAt: now,
      updatedAt: now,
    };
    return this.repository.setAccountCapability(capability);
  }

  public async listCapabilities(
    accountId: string,
  ): Promise<ProviderAccountCapability[]> {
    return this.repository.listAccountCapabilities(accountId);
  }

  // Limits Management
  public async setLimit(
    accountId: string,
    input: SetAccountLimitRequest,
  ): Promise<ProviderAccountLimit> {
    const now = new Date();
    const limit: ProviderAccountLimit = {
      id: `palim_${createPublicId("key").slice(4)}`,
      providerAccountId: accountId,
      ...(input.canonicalModelId
        ? { canonicalModelId: input.canonicalModelId }
        : {}),
      limitType: input.limitType,
      limitValue: input.limitValue,
      ...(input.windowSeconds ? { windowSeconds: input.windowSeconds } : {}),
      source: input.source || "configured",
      effectiveAt: input.effectiveAt || now,
      ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
      createdAt: now,
      updatedAt: now,
    };
    return this.repository.setAccountLimit(limit);
  }

  public async listLimits(accountId: string): Promise<ProviderAccountLimit[]> {
    return this.repository.listAccountLimits(accountId);
  }
}
