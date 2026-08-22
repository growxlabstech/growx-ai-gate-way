/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  and,
  eq,
  inArray,
  providerCredentials,
  providers,
} from "@growx/database";
import type {
  IProviderRepository,
  ProviderListFilter,
} from "../application/repository.js";
import type {
  ProviderCredentialEntity,
  ProviderEntity,
} from "../domain/types.js";

export class DatabaseProviderRepository implements IProviderRepository {
  constructor(private readonly db: any) {}

  async createProvider(provider: ProviderEntity): Promise<ProviderEntity> {
    await this.db.insert(providers).values({
      id: provider.id,
      name: provider.displayName,
      slug: provider.code,
      status: provider.status,
      adapterType: provider.adapterType,
      baseUrl: provider.baseUrl,
      apiVersion: provider.apiVersion ?? null,
      region: provider.region,
      priority: provider.priority,
      enabled: provider.enabled,
      metadata: provider.metadata,
      createdAt: provider.createdAt,
      updatedAt: provider.updatedAt,
    });
    return provider;
  }

  async getProviderById(id: string): Promise<ProviderEntity | null> {
    const rows = await this.db
      .select()
      .from(providers)
      .where(eq(providers.id, id));
    const r = rows[0];
    if (!r) return null;
    return this.mapProvider(r);
  }

  async getProviderByCode(code: string): Promise<ProviderEntity | null> {
    const rows = await this.db
      .select()
      .from(providers)
      .where(eq(providers.slug, code.toLowerCase()));
    const r = rows[0];
    if (!r) return null;
    return this.mapProvider(r);
  }

  async updateProvider(
    id: string,
    updates: Partial<ProviderEntity>,
  ): Promise<ProviderEntity> {
    const dbUpdates: Record<string, unknown> = {
      updatedAt: updates.updatedAt ?? new Date(),
    };
    if (updates.displayName !== undefined) dbUpdates.name = updates.displayName;
    if (updates.code !== undefined) dbUpdates.slug = updates.code.toLowerCase();
    if (updates.status !== undefined) dbUpdates.status = updates.status;
    if (updates.adapterType !== undefined)
      dbUpdates.adapterType = updates.adapterType;
    if (updates.baseUrl !== undefined) dbUpdates.baseUrl = updates.baseUrl;
    if (updates.apiVersion !== undefined)
      dbUpdates.apiVersion = updates.apiVersion;
    if (updates.region !== undefined) dbUpdates.region = updates.region;
    if (updates.priority !== undefined) dbUpdates.priority = updates.priority;
    if (updates.enabled !== undefined) dbUpdates.enabled = updates.enabled;
    if (updates.metadata !== undefined) dbUpdates.metadata = updates.metadata;

    await this.db.update(providers).set(dbUpdates).where(eq(providers.id, id));
    const updated = await this.getProviderById(id);
    if (!updated) throw new Error(`Provider ${id} not found after update`);
    return updated;
  }

  async listProviders(filter?: ProviderListFilter): Promise<ProviderEntity[]> {
    const conditions: any[] = [];
    if (filter?.status && filter.status.length > 0) {
      conditions.push(
        inArray(providers.status, filter.status as unknown as any[]),
      );
    }
    if (filter?.enabled !== undefined) {
      conditions.push(eq(providers.enabled, filter.enabled));
    }

    const rows =
      conditions.length > 0
        ? await this.db
            .select()
            .from(providers)
            .where(and(...conditions))
        : await this.db.select().from(providers);

    return rows.map((r: any) => this.mapProvider(r));
  }

  async createCredential(
    credential: ProviderCredentialEntity,
  ): Promise<ProviderCredentialEntity> {
    await this.db.insert(providerCredentials).values({
      id: credential.id,
      providerId: credential.providerId,
      connectionId: credential.connectionId ?? null,
      name: credential.name,
      environment: credential.environment,
      encryptedPayload: credential.encryptedPayload,
      encryptionKeyVersion: credential.encryptionKeyVersion,
      status: credential.status,
      metadata: credential.metadata,
      rotatedAt: credential.rotatedAt ?? null,
      disabledAt: credential.disabledAt ?? null,
      createdAt: credential.createdAt,
      updatedAt: credential.updatedAt,
    });
    return credential;
  }

  async getCredentialById(
    id: string,
  ): Promise<ProviderCredentialEntity | null> {
    const rows = await this.db
      .select()
      .from(providerCredentials)
      .where(eq(providerCredentials.id, id));
    const r = rows[0];
    if (!r) return null;
    return this.mapCredential(r);
  }

  async getEffectiveCredential(
    providerId: string,
    environment?: string,
    credentialId?: string,
  ): Promise<ProviderCredentialEntity | null> {
    if (credentialId) {
      const specific = await this.getCredentialById(credentialId);
      if (specific && specific.providerId === providerId) {
        return specific;
      }
    }

    const conditions: any[] = [
      eq(providerCredentials.providerId, providerId),
      inArray(providerCredentials.status, ["active", "rotating"]),
    ];

    if (environment) {
      conditions.push(eq(providerCredentials.environment, environment));
    }

    const rows = await this.db
      .select()
      .from(providerCredentials)
      .where(and(...conditions));

    if (rows.length === 0) {
      // Fallback without environment
      const anyRows = await this.db
        .select()
        .from(providerCredentials)
        .where(
          and(
            eq(providerCredentials.providerId, providerId),
            inArray(providerCredentials.status, ["active", "rotating"]),
          ),
        );
      return anyRows[0] ? this.mapCredential(anyRows[0]) : null;
    }

    return this.mapCredential(rows[0]);
  }

  async listCredentialsByProviderId(
    providerId: string,
  ): Promise<ProviderCredentialEntity[]> {
    const rows = await this.db
      .select()
      .from(providerCredentials)
      .where(eq(providerCredentials.providerId, providerId));
    return rows.map((r: any) => this.mapCredential(r));
  }

  async updateCredential(
    id: string,
    updates: Partial<ProviderCredentialEntity>,
  ): Promise<ProviderCredentialEntity> {
    const dbUpdates: Record<string, unknown> = {
      updatedAt: updates.updatedAt ?? new Date(),
    };
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.environment !== undefined)
      dbUpdates.environment = updates.environment;
    if (updates.encryptedPayload !== undefined)
      dbUpdates.encryptedPayload = updates.encryptedPayload;
    if (updates.encryptionKeyVersion !== undefined)
      dbUpdates.encryptionKeyVersion = updates.encryptionKeyVersion;
    if (updates.status !== undefined) dbUpdates.status = updates.status;
    if (updates.metadata !== undefined) dbUpdates.metadata = updates.metadata;
    if (updates.rotatedAt !== undefined)
      dbUpdates.rotatedAt = updates.rotatedAt;
    if (updates.disabledAt !== undefined)
      dbUpdates.disabledAt = updates.disabledAt;

    await this.db
      .update(providerCredentials)
      .set(dbUpdates)
      .where(eq(providerCredentials.id, id));

    const updated = await this.getCredentialById(id);
    if (!updated) throw new Error(`Credential ${id} not found after update`);
    return updated;
  }

  private mapProvider(r: any): ProviderEntity {
    return {
      id: r.id,
      code: r.slug,
      displayName: r.name,
      adapterType: r.adapterType,
      baseUrl: r.baseUrl,
      apiVersion: r.apiVersion ?? null,
      region: r.region ?? "global",
      priority: r.priority ?? 100,
      enabled: r.enabled ?? true,
      status: r.status ?? "active",
      metadata: (r.metadata as Record<string, unknown>) ?? {},
      createdAt:
        r.createdAt instanceof Date ? r.createdAt : new Date(r.createdAt),
      updatedAt:
        r.updatedAt instanceof Date ? r.updatedAt : new Date(r.updatedAt),
    };
  }

  private mapCredential(r: any): ProviderCredentialEntity {
    return {
      id: r.id,
      providerId: r.providerId,
      connectionId: r.connectionId ?? null,
      name: r.name ?? "default",
      environment: r.environment ?? "production",
      encryptedPayload: r.encryptedPayload,
      encryptionKeyVersion: r.encryptionKeyVersion ?? "v1",
      status: r.status ?? "active",
      metadata: (r.metadata as Record<string, unknown>) ?? {},
      createdAt:
        r.createdAt instanceof Date ? r.createdAt : new Date(r.createdAt),
      updatedAt:
        r.updatedAt instanceof Date ? r.updatedAt : new Date(r.updatedAt),
      rotatedAt: r.rotatedAt
        ? r.rotatedAt instanceof Date
          ? r.rotatedAt
          : new Date(r.rotatedAt)
        : null,
      disabledAt: r.disabledAt
        ? r.disabledAt instanceof Date
          ? r.disabledAt
          : new Date(r.disabledAt)
        : null,
    };
  }

  // Phase 28 Database Stubs
  async createAccount(account: any): Promise<any> {
    return account;
  }
  async getAccountById(_id: string): Promise<any> {
    return null;
  }
  async updateAccount(_id: string, updates: any): Promise<any> {
    return updates;
  }
  async listAccountsByProviderId(_providerId: string): Promise<any[]> {
    return [];
  }

  async createCredentialV2(credential: any): Promise<any> {
    return credential;
  }
  async createCredentialVersion(version: any): Promise<any> {
    return version;
  }
  async getCredentialVersionById(_id: string): Promise<any> {
    return null;
  }
  async getActiveCredentialVersion(_credentialId: string): Promise<any> {
    return null;
  }
  async updateCredentialVersion(_id: string, updates: any): Promise<any> {
    return updates;
  }
  async listCredentialVersions(_credentialId: string): Promise<any[]> {
    return [];
  }
  async listAllCredentialVersions(): Promise<any[]> {
    return [];
  }
  async listExpiringCredentials(_thresholdDate: Date): Promise<any[]> {
    return [];
  }

  async createPool(pool: any): Promise<any> {
    return pool;
  }
  async getPoolById(_id: string): Promise<any> {
    return null;
  }
  async listPools(_providerId?: string): Promise<any[]> {
    return [];
  }
  async addPoolMember(member: any): Promise<any> {
    return member;
  }
  async removePoolMember(_memberId: string): Promise<void> {}
  async listPoolMembers(_poolId: string): Promise<any[]> {
    return [];
  }

  async setAccountCapability(capability: any): Promise<any> {
    return capability;
  }
  async listAccountCapabilities(_accountId: string): Promise<any[]> {
    return [];
  }
  async setAccountLimit(limit: any): Promise<any> {
    return limit;
  }
  async listAccountLimits(_accountId: string): Promise<any[]> {
    return [];
  }
}
