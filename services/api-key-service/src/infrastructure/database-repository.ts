import { eq, and, sql, desc, count } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { schema } from "@growx/database";
import type {
  ApiKeyRecord,
  ApiKeyScope,
  ApiKeyStatus,
  ApiKeyEnvironment,
  ModelRule,
  ApiKeyRateLimit,
  ApiKeySpendingLimit,
  TenantState,
} from "../domain/types.js";

export interface ApiKeyRepository {
  insert(record: ApiKeyRecord, auditActorId?: string): Promise<void>;
  findById(
    organizationId: string,
    workspaceId: string,
    id: string,
  ): Promise<ApiKeyRecord | null>;
  findByKeyId(
    keyId: string,
  ): Promise<{ record: ApiKeyRecord; tenant: TenantState } | null>;
  listByWorkspace(
    organizationId: string,
    workspaceId: string,
    options?: { limit?: number; cursor?: string },
  ): Promise<{ items: ApiKeyRecord[]; hasMore: boolean }>;
  update(
    organizationId: string,
    workspaceId: string,
    record: ApiKeyRecord,
    auditActorId?: string,
  ): Promise<void>;
  revoke(
    organizationId: string,
    workspaceId: string,
    id: string,
    actorId: string,
  ): Promise<ApiKeyRecord>;
  rotate(
    oldKey: {
      organizationId: string;
      workspaceId: string;
      id: string;
      overlapMinutes?: number;
    },
    newRecord: ApiKeyRecord,
    actorId: string,
  ): Promise<{ newRecord: ApiKeyRecord; oldRecord: ApiKeyRecord }>;
  updatePermissions(
    apiKeyId: string,
    permissions: readonly ApiKeyScope[],
  ): Promise<void>;
  updateModelRules(
    apiKeyId: string,
    rules: readonly ModelRule[],
  ): Promise<void>;
  updateRateLimits(
    apiKeyId: string,
    limits: readonly ApiKeyRateLimit[],
  ): Promise<void>;
  updateSpendingLimit(
    apiKeyId: string,
    limit: ApiKeySpendingLimit | null,
  ): Promise<void>;
  updateIpAllowlist(
    apiKeyId: string,
    allowlist: readonly string[],
  ): Promise<void>;
  countActiveKeys(organizationId: string, workspaceId: string): Promise<number>;
  updateLastUsed(id: string, timestamp: Date): Promise<void>;
}

export class InMemoryApiKeyRepository implements ApiKeyRepository {
  private readonly records = new Map<string, ApiKeyRecord>();
  private readonly tenants = new Map<string, TenantState>();

  setTenantState(orgOrWsId: string, state: TenantState) {
    this.tenants.set(orgOrWsId, state);
  }

  async insert(record: ApiKeyRecord): Promise<void> {
    this.records.set(record.id, { ...record });
  }

  async findById(
    organizationId: string,
    workspaceId: string,
    id: string,
  ): Promise<ApiKeyRecord | null> {
    const record = this.records.get(id);
    if (!record) return null;
    if (organizationId !== "*" && record.organizationId !== organizationId)
      return null;
    if (workspaceId !== "*" && record.workspaceId !== workspaceId) return null;
    return { ...record };
  }

  async findByKeyId(
    keyId: string,
  ): Promise<{ record: ApiKeyRecord; tenant: TenantState } | null> {
    const record = this.records.get(keyId);
    if (!record) return null;
    const tenant = this.tenants.get(record.workspaceId) ??
      this.tenants.get(record.organizationId) ?? {
        organizationStatus: "active",
        workspaceStatus: "active",
        environmentStatus: "active",
      };
    return { record: { ...record }, tenant };
  }

  async listByWorkspace(
    organizationId: string,
    workspaceId: string,
    options?: { limit?: number },
  ): Promise<{ items: ApiKeyRecord[]; hasMore: boolean }> {
    const limit = options?.limit ?? 50;
    const items = Array.from(this.records.values())
      .filter(
        (r) =>
          r.organizationId === organizationId && r.workspaceId === workspaceId,
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
    return { items, hasMore: false };
  }

  async update(
    organizationId: string,
    workspaceId: string,
    record: ApiKeyRecord,
  ): Promise<void> {
    const existing = await this.findById(
      organizationId,
      workspaceId,
      record.id,
    );
    if (!existing) throw new Error("API key not found");
    this.records.set(record.id, { ...record });
  }

  async revoke(
    organizationId: string,
    workspaceId: string,
    id: string,
    actorId: string,
  ): Promise<ApiKeyRecord> {
    const existing = await this.findById(organizationId, workspaceId, id);
    if (!existing) throw new Error("API key not found");
    const now = new Date();
    const revoked: ApiKeyRecord = {
      ...existing,
      status: "revoked",
      revokedAt: now,
      revokedBy: actorId,
      updatedAt: now,
    };
    this.records.set(id, revoked);
    return revoked;
  }

  async rotate(
    oldKey: {
      organizationId: string;
      workspaceId: string;
      id: string;
      overlapMinutes?: number;
    },
    newRecord: ApiKeyRecord,
    actorId: string,
  ): Promise<{ newRecord: ApiKeyRecord; oldRecord: ApiKeyRecord }> {
    const existing = await this.findById(
      oldKey.organizationId,
      oldKey.workspaceId,
      oldKey.id,
    );
    if (!existing) throw new Error("API key not found");
    const now = new Date();
    const overlap = oldKey.overlapMinutes ?? 0;

    let updatedOld: ApiKeyRecord;
    if (overlap > 0) {
      const overlapExpiry = new Date(now.getTime() + overlap * 60 * 1000);
      updatedOld = {
        ...existing,
        expiresAt:
          existing.expiresAt && existing.expiresAt < overlapExpiry
            ? existing.expiresAt
            : overlapExpiry,
        updatedAt: now,
      };
    } else {
      updatedOld = {
        ...existing,
        status: "revoked",
        revokedAt: now,
        revokedBy: actorId,
        updatedAt: now,
      };
    }

    this.records.set(oldKey.id, updatedOld);
    this.records.set(newRecord.id, { ...newRecord });
    return { newRecord, oldRecord: updatedOld };
  }

  async updatePermissions(
    apiKeyId: string,
    permissions: readonly ApiKeyScope[],
  ): Promise<void> {
    const record = this.records.get(apiKeyId);
    if (record) {
      record.permissions = [...permissions];
      record.updatedAt = new Date();
    }
  }

  async updateModelRules(
    apiKeyId: string,
    rules: readonly ModelRule[],
  ): Promise<void> {
    const record = this.records.get(apiKeyId);
    if (record) {
      record.modelRules = [...rules];
      record.updatedAt = new Date();
    }
  }

  async updateRateLimits(
    apiKeyId: string,
    limits: readonly ApiKeyRateLimit[],
  ): Promise<void> {
    const record = this.records.get(apiKeyId);
    if (record) {
      record.rateLimits = [...limits];
      record.updatedAt = new Date();
    }
  }

  async updateSpendingLimit(
    apiKeyId: string,
    limit: ApiKeySpendingLimit | null,
  ): Promise<void> {
    const record = this.records.get(apiKeyId);
    if (record) {
      record.spendingLimit = limit;
      record.updatedAt = new Date();
    }
  }

  async updateIpAllowlist(
    apiKeyId: string,
    allowlist: readonly string[],
  ): Promise<void> {
    const record = this.records.get(apiKeyId);
    if (record) {
      record.ipAllowlist = [...allowlist];
      record.updatedAt = new Date();
    }
  }

  async countActiveKeys(
    organizationId: string,
    workspaceId: string,
  ): Promise<number> {
    const now = new Date();
    return Array.from(this.records.values()).filter(
      (r) =>
        r.organizationId === organizationId &&
        r.workspaceId === workspaceId &&
        r.status === "active" &&
        (!r.expiresAt || r.expiresAt > now) &&
        !r.revokedAt,
    ).length;
  }

  async updateLastUsed(id: string, timestamp: Date): Promise<void> {
    const record = this.records.get(id);
    if (record) {
      record.lastUsedAt = timestamp;
    }
  }
}

export class DrizzleApiKeyRepository implements ApiKeyRepository {
  constructor(private readonly db: PostgresJsDatabase<typeof schema>) {}

  async insert(record: ApiKeyRecord, auditActorId?: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.insert(schema.apiKeys).values({
        id: record.id,
        organizationId: record.organizationId,
        workspaceId: record.workspaceId,
        environmentId: record.environmentId,
        name: record.name,
        prefix: record.prefix,
        secretHash: record.secretHash,
        status: record.status,
        createdBy: record.createdBy,
        expiresAt: record.expiresAt,
        lastUsedAt: record.lastUsedAt,
        revokedAt: record.revokedAt,
        revokedBy: record.revokedBy,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      });

      if (record.permissions.length > 0) {
        await tx.insert(schema.apiKeyPermissions).values(
          record.permissions.map((permission) => ({
            apiKeyId: record.id,
            permission,
            createdAt: record.createdAt,
          })),
        );
      }

      if (record.modelRules.length > 0) {
        await tx.insert(schema.apiKeyModelRules).values(
          record.modelRules.map((rule) => ({
            id: rule.id ?? `rule_${crypto.randomUUID().replace(/-/g, "")}`,
            apiKeyId: record.id,
            effect: rule.effect,
            pattern: rule.pattern,
            category: rule.category ?? null,
            maximumCostMinor: rule.maximumCostMinor ?? null,
            createdAt: record.createdAt,
          })),
        );
      }

      if (record.rateLimits && record.rateLimits.length > 0) {
        await tx.insert(schema.apiKeyRateLimits).values(
          record.rateLimits.map((limit) => ({
            id: limit.id ?? `rl_${crypto.randomUUID().replace(/-/g, "")}`,
            apiKeyId: record.id,
            window: limit.window,
            requestLimit: limit.requestLimit,
            createdAt: record.createdAt,
          })),
        );
      }

      if (record.spendingLimit) {
        await tx.insert(schema.apiKeySpendingLimits).values({
          apiKeyId: record.id,
          mode: record.spendingLimit.mode,
          perRequestMinor: record.spendingLimit.perRequestMinor ?? null,
          dailyMinor: record.spendingLimit.dailyMinor ?? null,
          monthlyMinor: record.spendingLimit.monthlyMinor ?? null,
          currency: record.spendingLimit.currency ?? "USD",
          policyVersion: record.spendingLimit.policyVersion ?? 1,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
        });
      }

      if (record.ipAllowlist.length > 0) {
        await tx.insert(schema.apiKeyIpAllowlists).values(
          record.ipAllowlist.map((cidr) => ({
            id: `ip_${crypto.randomUUID().replace(/-/g, "")}`,
            apiKeyId: record.id,
            cidr,
            createdAt: record.createdAt,
          })),
        );
      }

      await tx.insert(schema.auditEvents).values({
        id: `aud_${crypto.randomUUID().replace(/-/g, "")}`,
        organizationId: record.organizationId,
        workspaceId: record.workspaceId,
        actorType: "user",
        actorId: auditActorId ?? record.createdBy,
        action: "api_key.created",
        resourceType: "apiKey",
        resourceId: record.id,
        requestId: `req_${crypto.randomUUID().replace(/-/g, "")}`,
        metadata: {
          name: record.name,
          prefix: record.prefix,
          environment: record.environment,
          permissions: record.permissions,
          expiresAt: record.expiresAt?.toISOString() ?? null,
        },
        createdAt: record.createdAt,
      });

      await tx.insert(schema.outbox).values({
        id: `out_${crypto.randomUUID().replace(/-/g, "")}`,
        topic: "api-keys",
        organizationId: record.organizationId,
        workspaceId: record.workspaceId,
        payload: {
          eventType: "api_key.created",
          apiKeyId: record.id,
          name: record.name,
          prefix: record.prefix,
          environment: record.environment,
          permissions: record.permissions,
          occurredAt: record.createdAt.toISOString(),
        },
        createdAt: record.createdAt,
      });
    });
  }

  async findById(
    organizationId: string,
    workspaceId: string,
    id: string,
  ): Promise<ApiKeyRecord | null> {
    const conditions = [eq(schema.apiKeys.id, id)];
    if (organizationId !== "*")
      conditions.push(eq(schema.apiKeys.organizationId, organizationId));
    if (workspaceId !== "*")
      conditions.push(eq(schema.apiKeys.workspaceId, workspaceId));

    const rows = await this.db
      .select()
      .from(schema.apiKeys)
      .where(and(...conditions))
      .limit(1);

    if (rows.length === 0 || !rows[0]) return null;
    return this.hydrateRecord(rows[0]);
  }

  async findByKeyId(
    keyId: string,
  ): Promise<{ record: ApiKeyRecord; tenant: TenantState } | null> {
    const rows = await this.db
      .select({
        apiKey: schema.apiKeys,
        orgStatus: schema.organizations.status,
        wsStatus: schema.workspaces.status,
        envStatus: schema.environments.status,
        envType: schema.environments.type,
      })
      .from(schema.apiKeys)
      .innerJoin(
        schema.organizations,
        eq(schema.apiKeys.organizationId, schema.organizations.id),
      )
      .innerJoin(
        schema.workspaces,
        eq(schema.apiKeys.workspaceId, schema.workspaces.id),
      )
      .innerJoin(
        schema.environments,
        eq(schema.apiKeys.environmentId, schema.environments.id),
      )
      .where(eq(schema.apiKeys.id, keyId))
      .limit(1);

    if (rows.length === 0 || !rows[0]) return null;
    const row = rows[0];
    const record = await this.hydrateRecord(row.apiKey);

    const tenant: TenantState = {
      organizationStatus: row.orgStatus as TenantState["organizationStatus"],
      workspaceStatus: row.wsStatus as TenantState["workspaceStatus"],
      environmentStatus: row.envStatus as TenantState["environmentStatus"],
    };

    return { record, tenant };
  }

  async listByWorkspace(
    organizationId: string,
    workspaceId: string,
    options?: { limit?: number },
  ): Promise<{ items: ApiKeyRecord[]; hasMore: boolean }> {
    const limit = options?.limit ?? 50;
    const rows = await this.db
      .select()
      .from(schema.apiKeys)
      .where(
        and(
          eq(schema.apiKeys.organizationId, organizationId),
          eq(schema.apiKeys.workspaceId, workspaceId),
        ),
      )
      .orderBy(desc(schema.apiKeys.createdAt))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const selectedRows = hasMore ? rows.slice(0, limit) : rows;

    const items = await Promise.all(
      selectedRows.map((row) => this.hydrateRecord(row)),
    );
    return { items, hasMore };
  }

  async update(
    organizationId: string,
    workspaceId: string,
    record: ApiKeyRecord,
    auditActorId?: string,
  ): Promise<void> {
    const now = new Date();
    await this.db.transaction(async (tx) => {
      await tx
        .update(schema.apiKeys)
        .set({
          name: record.name,
          expiresAt: record.expiresAt,
          status: record.status,
          updatedAt: now,
        })
        .where(
          and(
            eq(schema.apiKeys.id, record.id),
            eq(schema.apiKeys.organizationId, organizationId),
            eq(schema.apiKeys.workspaceId, workspaceId),
          ),
        );

      await tx.insert(schema.auditEvents).values({
        id: `aud_${crypto.randomUUID().replace(/-/g, "")}`,
        organizationId,
        workspaceId,
        actorType: "user",
        actorId: auditActorId ?? record.createdBy,
        action: "api_key.updated",
        resourceType: "apiKey",
        resourceId: record.id,
        requestId: `req_${crypto.randomUUID().replace(/-/g, "")}`,
        metadata: {
          name: record.name,
          status: record.status,
          expiresAt: record.expiresAt?.toISOString() ?? null,
        },
        createdAt: now,
      });

      await tx.insert(schema.outbox).values({
        id: `out_${crypto.randomUUID().replace(/-/g, "")}`,
        topic: "api-keys",
        organizationId,
        workspaceId,
        payload: {
          eventType: "api_key.updated",
          apiKeyId: record.id,
          name: record.name,
          status: record.status,
          occurredAt: now.toISOString(),
        },
        createdAt: now,
      });
    });
  }

  async revoke(
    organizationId: string,
    workspaceId: string,
    id: string,
    actorId: string,
  ): Promise<ApiKeyRecord> {
    const now = new Date();
    return await this.db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(schema.apiKeys)
        .where(
          and(
            eq(schema.apiKeys.id, id),
            eq(schema.apiKeys.organizationId, organizationId),
            eq(schema.apiKeys.workspaceId, workspaceId),
          ),
        )
        .limit(1);

      if (rows.length === 0 || !rows[0]) {
        throw new Error("API key not found");
      }

      await tx
        .update(schema.apiKeys)
        .set({
          status: "revoked",
          revokedAt: now,
          revokedBy: actorId,
          updatedAt: now,
        })
        .where(eq(schema.apiKeys.id, id));

      await tx.insert(schema.auditEvents).values({
        id: `aud_${crypto.randomUUID().replace(/-/g, "")}`,
        organizationId,
        workspaceId,
        actorType: "user",
        actorId,
        action: "api_key.revoked",
        resourceType: "apiKey",
        resourceId: id,
        requestId: `req_${crypto.randomUUID().replace(/-/g, "")}`,
        metadata: {
          revokedAt: now.toISOString(),
          revokedBy: actorId,
        },
        createdAt: now,
      });

      await tx.insert(schema.outbox).values({
        id: `out_${crypto.randomUUID().replace(/-/g, "")}`,
        topic: "api-keys",
        organizationId,
        workspaceId,
        payload: {
          eventType: "api_key.revoked",
          apiKeyId: id,
          revokedAt: now.toISOString(),
          revokedBy: actorId,
        },
        createdAt: now,
      });

      const updatedRow = {
        ...rows[0],
        status: "revoked" as const,
        revokedAt: now,
        revokedBy: actorId,
        updatedAt: now,
      };
      return this.hydrateRecord(updatedRow);
    });
  }

  async rotate(
    oldKey: {
      organizationId: string;
      workspaceId: string;
      id: string;
      overlapMinutes?: number;
    },
    newRecord: ApiKeyRecord,
    actorId: string,
  ): Promise<{ newRecord: ApiKeyRecord; oldRecord: ApiKeyRecord }> {
    const now = new Date();
    const overlap = oldKey.overlapMinutes ?? 0;

    return await this.db.transaction(async (tx) => {
      const oldRows = await tx
        .select()
        .from(schema.apiKeys)
        .where(
          and(
            eq(schema.apiKeys.id, oldKey.id),
            eq(schema.apiKeys.organizationId, oldKey.organizationId),
            eq(schema.apiKeys.workspaceId, oldKey.workspaceId),
          ),
        )
        .limit(1);

      if (oldRows.length === 0 || !oldRows[0]) {
        throw new Error("API key not found");
      }
      const oldRow = oldRows[0];

      let oldRevokedAt: Date | null = null;
      let oldStatus: ApiKeyStatus = "revoked";
      let oldExpiresAt: Date | null = oldRow.expiresAt;

      if (overlap > 0) {
        const overlapExpiry = new Date(now.getTime() + overlap * 60 * 1000);
        oldExpiresAt =
          oldRow.expiresAt && oldRow.expiresAt < overlapExpiry
            ? oldRow.expiresAt
            : overlapExpiry;
        oldStatus = "active";
      } else {
        oldRevokedAt = now;
        oldStatus = "revoked";
      }

      await tx
        .update(schema.apiKeys)
        .set({
          status: oldStatus,
          expiresAt: oldExpiresAt,
          revokedAt: oldRevokedAt,
          revokedBy: oldRevokedAt ? actorId : null,
          updatedAt: now,
        })
        .where(eq(schema.apiKeys.id, oldKey.id));

      await tx.insert(schema.apiKeys).values({
        id: newRecord.id,
        organizationId: newRecord.organizationId,
        workspaceId: newRecord.workspaceId,
        environmentId: newRecord.environmentId,
        name: newRecord.name,
        prefix: newRecord.prefix,
        secretHash: newRecord.secretHash,
        status: newRecord.status,
        createdBy: actorId,
        expiresAt: newRecord.expiresAt,
        lastUsedAt: null,
        revokedAt: null,
        revokedBy: null,
        createdAt: now,
        updatedAt: now,
      });

      if (newRecord.permissions.length > 0) {
        await tx.insert(schema.apiKeyPermissions).values(
          newRecord.permissions.map((permission) => ({
            apiKeyId: newRecord.id,
            permission,
            createdAt: now,
          })),
        );
      }

      if (newRecord.modelRules.length > 0) {
        await tx.insert(schema.apiKeyModelRules).values(
          newRecord.modelRules.map((rule) => ({
            id: rule.id ?? `rule_${crypto.randomUUID().replace(/-/g, "")}`,
            apiKeyId: newRecord.id,
            effect: rule.effect,
            pattern: rule.pattern,
            category: rule.category ?? null,
            maximumCostMinor: rule.maximumCostMinor ?? null,
            createdAt: now,
          })),
        );
      }

      if (newRecord.ipAllowlist.length > 0) {
        await tx.insert(schema.apiKeyIpAllowlists).values(
          newRecord.ipAllowlist.map((cidr) => ({
            id: `ip_${crypto.randomUUID().replace(/-/g, "")}`,
            apiKeyId: newRecord.id,
            cidr,
            createdAt: now,
          })),
        );
      }

      await tx.insert(schema.auditEvents).values({
        id: `aud_${crypto.randomUUID().replace(/-/g, "")}`,
        organizationId: oldKey.organizationId,
        workspaceId: oldKey.workspaceId,
        actorType: "user",
        actorId,
        action: "api_key.rotated",
        resourceType: "apiKey",
        resourceId: newRecord.id,
        requestId: `req_${crypto.randomUUID().replace(/-/g, "")}`,
        metadata: {
          oldKeyId: oldKey.id,
          newKeyId: newRecord.id,
          overlapMinutes: overlap,
        },
        createdAt: now,
      });

      await tx.insert(schema.outbox).values({
        id: `out_${crypto.randomUUID().replace(/-/g, "")}`,
        topic: "api-keys",
        organizationId: oldKey.organizationId,
        workspaceId: oldKey.workspaceId,
        payload: {
          eventType: "api_key.rotated",
          oldKeyId: oldKey.id,
          newKeyId: newRecord.id,
          overlapMinutes: overlap,
          occurredAt: now.toISOString(),
        },
        createdAt: now,
      });

      const updatedOldRecord = await this.hydrateRecord({
        ...oldRow,
        status: oldStatus,
        expiresAt: oldExpiresAt,
        revokedAt: oldRevokedAt,
        revokedBy: oldRevokedAt ? actorId : null,
        updatedAt: now,
      });

      return { newRecord, oldRecord: updatedOldRecord };
    });
  }

  async updatePermissions(
    apiKeyId: string,
    permissions: readonly ApiKeyScope[],
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .delete(schema.apiKeyPermissions)
        .where(eq(schema.apiKeyPermissions.apiKeyId, apiKeyId));
      if (permissions.length > 0) {
        await tx.insert(schema.apiKeyPermissions).values(
          permissions.map((permission) => ({
            apiKeyId,
            permission,
            createdAt: new Date(),
          })),
        );
      }
      await tx
        .update(schema.apiKeys)
        .set({ updatedAt: new Date() })
        .where(eq(schema.apiKeys.id, apiKeyId));
    });
  }

  async updateModelRules(
    apiKeyId: string,
    rules: readonly ModelRule[],
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .delete(schema.apiKeyModelRules)
        .where(eq(schema.apiKeyModelRules.apiKeyId, apiKeyId));
      if (rules.length > 0) {
        await tx.insert(schema.apiKeyModelRules).values(
          rules.map((rule) => ({
            id: rule.id ?? `rule_${crypto.randomUUID().replace(/-/g, "")}`,
            apiKeyId,
            effect: rule.effect,
            pattern: rule.pattern,
            category: rule.category ?? null,
            maximumCostMinor: rule.maximumCostMinor ?? null,
            createdAt: new Date(),
          })),
        );
      }
      await tx
        .update(schema.apiKeys)
        .set({ updatedAt: new Date() })
        .where(eq(schema.apiKeys.id, apiKeyId));
    });
  }

  async updateRateLimits(
    apiKeyId: string,
    limits: readonly ApiKeyRateLimit[],
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .delete(schema.apiKeyRateLimits)
        .where(eq(schema.apiKeyRateLimits.apiKeyId, apiKeyId));
      if (limits.length > 0) {
        await tx.insert(schema.apiKeyRateLimits).values(
          limits.map((limit) => ({
            id: limit.id ?? `rl_${crypto.randomUUID().replace(/-/g, "")}`,
            apiKeyId,
            window: limit.window,
            requestLimit: limit.requestLimit,
            createdAt: new Date(),
          })),
        );
      }
      await tx
        .update(schema.apiKeys)
        .set({ updatedAt: new Date() })
        .where(eq(schema.apiKeys.id, apiKeyId));
    });
  }

  async updateSpendingLimit(
    apiKeyId: string,
    limit: ApiKeySpendingLimit | null,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .delete(schema.apiKeySpendingLimits)
        .where(eq(schema.apiKeySpendingLimits.apiKeyId, apiKeyId));
      if (limit) {
        await tx.insert(schema.apiKeySpendingLimits).values({
          apiKeyId,
          mode: limit.mode,
          perRequestMinor: limit.perRequestMinor ?? null,
          dailyMinor: limit.dailyMinor ?? null,
          monthlyMinor: limit.monthlyMinor ?? null,
          currency: limit.currency ?? "USD",
          policyVersion: limit.policyVersion ?? 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
      await tx
        .update(schema.apiKeys)
        .set({ updatedAt: new Date() })
        .where(eq(schema.apiKeys.id, apiKeyId));
    });
  }

  async updateIpAllowlist(
    apiKeyId: string,
    allowlist: readonly string[],
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .delete(schema.apiKeyIpAllowlists)
        .where(eq(schema.apiKeyIpAllowlists.apiKeyId, apiKeyId));
      if (allowlist.length > 0) {
        await tx.insert(schema.apiKeyIpAllowlists).values(
          allowlist.map((cidr) => ({
            id: `ip_${crypto.randomUUID().replace(/-/g, "")}`,
            apiKeyId,
            cidr,
            createdAt: new Date(),
          })),
        );
      }
      await tx
        .update(schema.apiKeys)
        .set({ updatedAt: new Date() })
        .where(eq(schema.apiKeys.id, apiKeyId));
    });
  }

  async countActiveKeys(
    organizationId: string,
    workspaceId: string,
  ): Promise<number> {
    const now = new Date();
    const result = await this.db
      .select({ count: count() })
      .from(schema.apiKeys)
      .where(
        and(
          eq(schema.apiKeys.organizationId, organizationId),
          eq(schema.apiKeys.workspaceId, workspaceId),
          eq(schema.apiKeys.status, "active"),
          sql`(${schema.apiKeys.expiresAt} IS NULL OR ${schema.apiKeys.expiresAt} > ${now})`,
          sql`${schema.apiKeys.revokedAt} IS NULL`,
        ),
      );

    return Number(result[0]?.count ?? 0);
  }

  async updateLastUsed(id: string, timestamp: Date): Promise<void> {
    await this.db
      .update(schema.apiKeys)
      .set({ lastUsedAt: timestamp })
      .where(eq(schema.apiKeys.id, id));
  }

  private async hydrateRecord(
    row: typeof schema.apiKeys.$inferSelect,
  ): Promise<ApiKeyRecord> {
    const permissions = await this.db
      .select()
      .from(schema.apiKeyPermissions)
      .where(eq(schema.apiKeyPermissions.apiKeyId, row.id));

    const modelRules = await this.db
      .select()
      .from(schema.apiKeyModelRules)
      .where(eq(schema.apiKeyModelRules.apiKeyId, row.id));

    const ipAllowlists = await this.db
      .select()
      .from(schema.apiKeyIpAllowlists)
      .where(eq(schema.apiKeyIpAllowlists.apiKeyId, row.id));

    const rateLimits = await this.db
      .select()
      .from(schema.apiKeyRateLimits)
      .where(eq(schema.apiKeyRateLimits.apiKeyId, row.id));

    const spendingLimits = await this.db
      .select()
      .from(schema.apiKeySpendingLimits)
      .where(eq(schema.apiKeySpendingLimits.apiKeyId, row.id))
      .limit(1);

    const environment: ApiKeyEnvironment = row.prefix.startsWith("gx_live")
      ? "production"
      : "development";

    return {
      id: row.id,
      organizationId: row.organizationId,
      workspaceId: row.workspaceId,
      environmentId: row.environmentId,
      environment,
      name: row.name,
      prefix: row.prefix,
      secretHash: row.secretHash,
      status: row.status as ApiKeyStatus,
      permissions: permissions.map((p) => p.permission as ApiKeyScope),
      modelRules: modelRules.map((r) => ({
        id: r.id,
        effect: r.effect as "allow" | "deny",
        pattern: r.pattern,
        category: r.category ?? undefined,
        maximumCostMinor: r.maximumCostMinor ?? undefined,
      })),
      ipAllowlist: ipAllowlists.map((ip) => ip.cidr),
      rateLimits: rateLimits.map((rl) => ({
        id: rl.id,
        window: rl.window as "minute" | "hour" | "day",
        requestLimit: rl.requestLimit,
      })),
      spendingLimit: spendingLimits[0]
        ? {
            mode: spendingLimits[0].mode as "warn" | "soft" | "hard",
            perRequestMinor: spendingLimits[0].perRequestMinor ?? undefined,
            dailyMinor: spendingLimits[0].dailyMinor ?? undefined,
            monthlyMinor: spendingLimits[0].monthlyMinor ?? undefined,
            currency: spendingLimits[0].currency,
            policyVersion: spendingLimits[0].policyVersion,
          }
        : null,
      createdBy: row.createdBy,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      expiresAt: row.expiresAt,
      lastUsedAt: row.lastUsedAt,
      revokedAt: row.revokedAt,
      revokedBy: row.revokedBy,
    };
  }
}
