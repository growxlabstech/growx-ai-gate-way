import type {
  ProviderAccount,
  ProviderCredential,
  ProviderCredentialVersion,
  ProviderCredentialPool,
  ProviderCredentialPoolMember,
  ProviderAccountCapability,
  ProviderAccountLimit,
} from "@growx/contracts";
import type {
  IProviderRepository,
  ProviderListFilter,
} from "../application/repository.js";
import type {
  ProviderCredentialEntity,
  ProviderEntity,
} from "../domain/types.js";

export class InMemoryProviderRepository implements IProviderRepository {
  private readonly providers = new Map<string, ProviderEntity>();
  private readonly credentials = new Map<string, ProviderCredentialEntity>();
  private readonly accounts = new Map<string, ProviderAccount>();
  private readonly credentialVersions = new Map<
    string,
    ProviderCredentialVersion
  >();
  private readonly pools = new Map<string, ProviderCredentialPool>();
  private readonly poolMembers = new Map<
    string,
    ProviderCredentialPoolMember
  >();
  private readonly capabilities = new Map<string, ProviderAccountCapability>();
  private readonly limits = new Map<string, ProviderAccountLimit>();

  async createProvider(provider: ProviderEntity): Promise<ProviderEntity> {
    this.providers.set(provider.id, { ...provider });
    return { ...provider };
  }

  async getProviderById(id: string): Promise<ProviderEntity | null> {
    const p = this.providers.get(id);
    return p ? { ...p } : null;
  }

  async getProviderByCode(code: string): Promise<ProviderEntity | null> {
    const c = code.toLowerCase();
    for (const p of this.providers.values()) {
      if (p.code.toLowerCase() === c) return { ...p };
    }
    return null;
  }

  async updateProvider(
    id: string,
    updates: Partial<ProviderEntity>,
  ): Promise<ProviderEntity> {
    const current = this.providers.get(id);
    if (!current) throw new Error(`Provider ${id} not found`);
    const updated = { ...current, ...updates, updatedAt: new Date() };
    this.providers.set(id, updated);
    return { ...updated };
  }

  async listProviders(filter?: ProviderListFilter): Promise<ProviderEntity[]> {
    let list = Array.from(this.providers.values()).map((p) => ({ ...p }));
    if (filter?.status && filter.status.length > 0) {
      list = list.filter((p) => filter.status!.includes(p.status));
    }
    if (filter?.enabled !== undefined) {
      list = list.filter((p) => p.enabled === filter.enabled);
    }
    return list;
  }

  async createCredential(
    credential: ProviderCredentialEntity,
  ): Promise<ProviderCredentialEntity> {
    this.credentials.set(credential.id, { ...credential });
    return { ...credential };
  }

  async getCredentialById(
    id: string,
  ): Promise<ProviderCredentialEntity | null> {
    const c = this.credentials.get(id);
    return c ? { ...c } : null;
  }

  async getEffectiveCredential(
    providerId: string,
    environment?: string,
    credentialId?: string,
  ): Promise<ProviderCredentialEntity | null> {
    if (credentialId) {
      const specific = this.credentials.get(credentialId);
      if (specific && specific.providerId === providerId) {
        return { ...specific };
      }
    }

    const matching = Array.from(this.credentials.values()).filter(
      (c) =>
        c.providerId === providerId &&
        (c.status === "active" || c.status === "rotating") &&
        (!environment || c.environment === environment),
    );

    if (matching.length === 0) {
      const anyActive = Array.from(this.credentials.values()).filter(
        (c) =>
          c.providerId === providerId &&
          (c.status === "active" || c.status === "rotating"),
      );
      return anyActive[0] ? { ...anyActive[0] } : null;
    }

    return { ...matching[0]! };
  }

  async listCredentialsByProviderId(
    providerId: string,
  ): Promise<ProviderCredentialEntity[]> {
    return Array.from(this.credentials.values())
      .filter((c) => c.providerId === providerId)
      .map((c) => ({ ...c }));
  }

  async updateCredential(
    id: string,
    updates: Partial<ProviderCredentialEntity>,
  ): Promise<ProviderCredentialEntity> {
    const current = this.credentials.get(id);
    if (!current) throw new Error(`Credential ${id} not found`);
    const updated = { ...current, ...updates, updatedAt: new Date() };
    this.credentials.set(id, updated);
    return { ...updated };
  }

  // Phase 28: Provider Accounts
  async createAccount(account: ProviderAccount): Promise<ProviderAccount> {
    this.accounts.set(account.id, { ...account });
    return { ...account };
  }

  async getAccountById(id: string): Promise<ProviderAccount | null> {
    const a = this.accounts.get(id);
    return a ? { ...a } : null;
  }

  async updateAccount(
    id: string,
    updates: Partial<ProviderAccount>,
  ): Promise<ProviderAccount> {
    const current = this.accounts.get(id);
    if (!current) throw new Error(`Account ${id} not found`);
    const updated = { ...current, ...updates, updatedAt: new Date() };
    this.accounts.set(id, updated);
    return { ...updated };
  }

  async listAccountsByProviderId(
    providerId: string,
  ): Promise<ProviderAccount[]> {
    return Array.from(this.accounts.values())
      .filter((a) => a.providerId === providerId)
      .map((a) => ({ ...a }));
  }

  // Phase 28: Credential V2 & Versions
  async createCredentialV2(
    credential: ProviderCredential,
  ): Promise<ProviderCredential> {
    const entity: ProviderCredentialEntity = {
      id: credential.id,
      providerId: credential.providerId || "prov",
      name: credential.name,
      environment: credential.environment,
      encryptedPayload: credential.id,
      encryptionKeyVersion: "v1",
      status: credential.status as any,
      metadata: credential.metadata,
      createdAt: credential.createdAt,
      updatedAt: credential.updatedAt,
      providerAccountId: credential.providerAccountId,
      credentialType: credential.credentialType,
      activeVersionId: credential.activeVersionId,
    };
    this.credentials.set(credential.id, entity);
    return { ...credential };
  }

  async createCredentialVersion(
    version: ProviderCredentialVersion,
  ): Promise<ProviderCredentialVersion> {
    this.credentialVersions.set(version.id, { ...version });
    return { ...version };
  }

  async getCredentialVersionById(
    id: string,
  ): Promise<ProviderCredentialVersion | null> {
    const v = this.credentialVersions.get(id);
    return v ? { ...v } : null;
  }

  async getActiveCredentialVersion(
    credentialId: string,
  ): Promise<ProviderCredentialVersion | null> {
    for (const v of this.credentialVersions.values()) {
      if (v.credentialId === credentialId && v.status === "active") {
        return { ...v };
      }
    }
    return null;
  }

  async updateCredentialVersion(
    id: string,
    updates: Partial<ProviderCredentialVersion>,
  ): Promise<ProviderCredentialVersion> {
    const current = this.credentialVersions.get(id);
    if (!current) throw new Error(`Credential version ${id} not found`);
    const updated = { ...current, ...updates };
    this.credentialVersions.set(id, updated);
    return { ...updated };
  }

  async listCredentialVersions(
    credentialId: string,
  ): Promise<ProviderCredentialVersion[]> {
    return Array.from(this.credentialVersions.values())
      .filter((v) => v.credentialId === credentialId)
      .map((v) => ({ ...v }));
  }

  async listAllCredentialVersions(): Promise<ProviderCredentialVersion[]> {
    return Array.from(this.credentialVersions.values()).map((v) => ({ ...v }));
  }

  async listExpiringCredentials(
    thresholdDate: Date,
  ): Promise<ProviderCredential[]> {
    return Array.from(this.credentials.values())
      .filter(
        (c) =>
          c.expiresAt && c.expiresAt <= thresholdDate && c.status === "active",
      )
      .map((c) => ({
        id: c.id,
        providerAccountId: c.providerAccountId || "pacc",
        providerId: c.providerId,
        name: c.name,
        credentialType: (c.credentialType as any) || "api_key",
        status: c.status as any,
        environment: c.environment,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        expiresAt: c.expiresAt,
        metadata: c.metadata,
      }));
  }

  // Phase 28: Pools & Members
  async createPool(
    pool: ProviderCredentialPool,
  ): Promise<ProviderCredentialPool> {
    this.pools.set(pool.id, { ...pool });
    return { ...pool };
  }

  async getPoolById(id: string): Promise<ProviderCredentialPool | null> {
    const p = this.pools.get(id);
    return p ? { ...p } : null;
  }

  async listPools(providerId?: string): Promise<ProviderCredentialPool[]> {
    let list = Array.from(this.pools.values()).map((p) => ({ ...p }));
    if (providerId) {
      list = list.filter((p) => p.providerId === providerId);
    }
    return list;
  }

  async addPoolMember(
    member: ProviderCredentialPoolMember,
  ): Promise<ProviderCredentialPoolMember> {
    this.poolMembers.set(member.id, { ...member });
    return { ...member };
  }

  async removePoolMember(memberId: string): Promise<void> {
    this.poolMembers.delete(memberId);
  }

  async listPoolMembers(
    poolId: string,
  ): Promise<ProviderCredentialPoolMember[]> {
    return Array.from(this.poolMembers.values())
      .filter((m) => m.poolId === poolId)
      .map((m) => ({ ...m }));
  }

  // Phase 28: Capabilities & Limits
  async setAccountCapability(
    capability: ProviderAccountCapability,
  ): Promise<ProviderAccountCapability> {
    this.capabilities.set(capability.id, { ...capability });
    return { ...capability };
  }

  async listAccountCapabilities(
    accountId: string,
  ): Promise<ProviderAccountCapability[]> {
    return Array.from(this.capabilities.values())
      .filter((c) => c.providerAccountId === accountId)
      .map((c) => ({ ...c }));
  }

  async setAccountLimit(
    limit: ProviderAccountLimit,
  ): Promise<ProviderAccountLimit> {
    this.limits.set(limit.id, { ...limit });
    return { ...limit };
  }

  async listAccountLimits(accountId: string): Promise<ProviderAccountLimit[]> {
    return Array.from(this.limits.values())
      .filter((l) => l.providerAccountId === accountId)
      .map((l) => ({ ...l }));
  }
}
