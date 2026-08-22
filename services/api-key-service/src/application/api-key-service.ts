import type {
  ApiKeyRecord,
  ApiKeyScope,
  CreateApiKeyInput,
  UpdateApiKeyInput,
  AccessDecision,
  AccessInput,
  MachineAuthContext,
  ModelRule,
  ApiKeyRateLimit,
  ApiKeySpendingLimit,
} from "../domain/types.js";
import {
  generateApiKeyCredentials,
  hashApiKey,
  verifyApiKey,
  parseApiKey,
} from "../domain/key-format.js";
import {
  resolveEffectiveStatus,
  modelAllowed,
  isIpAllowed,
  validateDelegation,
} from "../domain/machine-principal.js";
import type { ApiKeyRepository } from "../infrastructure/database-repository.js";
import type { LifecycleEvents } from "../infrastructure/events.js";

export interface ApiKeyServiceConfig {
  pepper: string;
  maxActiveKeysPerWorkspace?: number | undefined;
  defaultExpiryDays?: number | undefined;
  maxExpiryDays?: number | undefined;
}

export class ApiKeyService {
  private readonly pepper: string;
  private readonly maxActiveKeys: number;
  private readonly defaultExpiryDays: number;
  private readonly maxExpiryDays: number;

  constructor(
    private readonly repository: ApiKeyRepository,
    private readonly events: LifecycleEvents,
    config: string | ApiKeyServiceConfig,
  ) {
    if (typeof config === "string") {
      this.pepper = config;
      this.maxActiveKeys = 50;
      this.defaultExpiryDays = 365;
      this.maxExpiryDays = 730;
    } else {
      this.pepper = config.pepper;
      this.maxActiveKeys = config.maxActiveKeysPerWorkspace ?? 50;
      this.defaultExpiryDays = config.defaultExpiryDays ?? 365;
      this.maxExpiryDays = config.maxExpiryDays ?? 730;
    }
    if (!this.pepper || Buffer.byteLength(this.pepper) < 32) {
      throw new Error("API key pepper must contain at least 32 bytes");
    }
  }

  async create(
    input: CreateApiKeyInput,
  ): Promise<{ record: ApiKeyRecord; secret: string }> {
    const activeCount = await this.repository.countActiveKeys(
      input.organizationId,
      input.workspaceId,
    );
    if (activeCount >= this.maxActiveKeys) {
      throw new Error(
        `Workspace active API key limit (${this.maxActiveKeys}) reached`,
      );
    }

    const requestedPermissions = input.permissions ?? [
      "models.read",
      "responses.create",
    ];
    if (input.creatorCapabilities) {
      const delegation = validateDelegation(
        input.creatorCapabilities,
        requestedPermissions,
      );
      if (!delegation.valid) {
        throw new Error(
          `Creator does not have authority to delegate scopes: ${delegation.unauthorizedScopes.join(", ")}`,
        );
      }
    }

    const now = new Date();
    let effectiveExpiresAt = input.expiresAt;
    if (effectiveExpiresAt === undefined && this.defaultExpiryDays > 0) {
      effectiveExpiresAt = new Date(
        now.getTime() + this.defaultExpiryDays * 86400 * 1000,
      );
    }
    if (effectiveExpiresAt && this.maxExpiryDays > 0) {
      const maxExpiryDate = new Date(
        now.getTime() + this.maxExpiryDays * 86400 * 1000,
      );
      if (effectiveExpiresAt > maxExpiryDate) {
        throw new Error(`Expiration cannot exceed ${this.maxExpiryDays} days`);
      }
    }

    const { id, prefix, secretPart, fullSecret } = generateApiKeyCredentials(
      input.environment,
    );
    const secretHash = hashApiKey(secretPart, this.pepper);

    const record: ApiKeyRecord = {
      id,
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      environmentId: input.environmentId,
      environment: input.environment,
      name: input.name.trim(),
      prefix,
      secretHash,
      status: "active",
      permissions: requestedPermissions,
      modelRules: input.modelRules ?? [],
      ipAllowlist: input.ipAllowlist ?? [],
      rateLimits: input.rateLimits,
      spendingLimit: input.spendingLimit,
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
      expiresAt: effectiveExpiresAt ?? null,
      lastUsedAt: null,
      revokedAt: null,
      revokedBy: null,
    };

    await this.repository.insert(record, input.createdBy);
    await this.events.audit("api_key.created", record, input.createdBy);
    await this.events.publish("api_key.created", record, input.createdBy);

    return { record, secret: fullSecret };
  }

  async list(
    organizationId: string,
    workspaceId: string,
    options?: { limit?: number; cursor?: string },
  ): Promise<{ items: ApiKeyRecord[]; hasMore: boolean }> {
    return await this.repository.listByWorkspace(
      organizationId,
      workspaceId,
      options,
    );
  }

  async get(
    organizationId: string,
    workspaceId: string,
    id: string,
  ): Promise<ApiKeyRecord | null> {
    return await this.repository.findById(organizationId, workspaceId, id);
  }

  async update(
    organizationId: string,
    workspaceId: string,
    id: string,
    input: UpdateApiKeyInput,
  ): Promise<ApiKeyRecord> {
    const current = await this.repository.findById(
      organizationId,
      workspaceId,
      id,
    );
    if (!current) {
      throw new Error("API key not found");
    }
    if (current.status === "revoked") {
      throw new Error("Cannot update a revoked API key");
    }

    if (input.permissions && input.creatorCapabilities) {
      const delegation = validateDelegation(
        input.creatorCapabilities,
        input.permissions,
      );
      if (!delegation.valid) {
        throw new Error(
          `Actor does not have authority to grant scopes: ${delegation.unauthorizedScopes.join(", ")}`,
        );
      }
    }

    const now = new Date();
    const updated: ApiKeyRecord = {
      ...current,
      name: input.name ? input.name.trim() : current.name,
      expiresAt:
        input.expiresAt !== undefined ? input.expiresAt : current.expiresAt,
      permissions: input.permissions ?? current.permissions,
      modelRules: input.modelRules ?? current.modelRules,
      ipAllowlist: input.ipAllowlist ?? current.ipAllowlist,
      updatedAt: now,
    };

    await this.repository.update(
      organizationId,
      workspaceId,
      updated,
      input.actorId,
    );
    if (input.permissions) {
      await this.repository.updatePermissions(id, input.permissions);
    }
    if (input.modelRules) {
      await this.repository.updateModelRules(id, input.modelRules);
    }
    if (input.ipAllowlist) {
      await this.repository.updateIpAllowlist(id, input.ipAllowlist);
    }

    await this.events.invalidate(id);
    await this.events.audit("api_key.updated", updated, input.actorId);
    await this.events.publish("api_key.updated", updated, input.actorId);

    return updated;
  }

  async revoke(
    organizationId: string,
    workspaceId: string,
    id: string,
    actorId: string,
  ): Promise<ApiKeyRecord> {
    const revoked = await this.repository.revoke(
      organizationId,
      workspaceId,
      id,
      actorId,
    );
    await this.events.invalidate(id);
    await this.events.audit("api_key.revoked", revoked, actorId);
    await this.events.publish("api_key.revoked", revoked, actorId);
    return revoked;
  }

  async rotate(
    organizationId: string,
    workspaceId: string,
    id: string,
    actorId: string,
    options?: { overlapMinutes?: number; reason?: string },
  ): Promise<{
    newRecord: ApiKeyRecord;
    secret: string;
    oldRecord: ApiKeyRecord;
  }> {
    const existing = await this.repository.findById(
      organizationId,
      workspaceId,
      id,
    );
    if (!existing) {
      throw new Error("API key not found");
    }
    if (existing.status === "revoked") {
      throw new Error("Cannot rotate a revoked API key");
    }

    const {
      id: newId,
      prefix: newPrefix,
      secretPart: newSecretPart,
      fullSecret: newFullSecret,
    } = generateApiKeyCredentials(existing.environment);
    const newSecretHash = hashApiKey(newSecretPart, this.pepper);
    const now = new Date();

    const newRecord: ApiKeyRecord = {
      id: newId,
      organizationId: existing.organizationId,
      workspaceId: existing.workspaceId,
      environmentId: existing.environmentId,
      environment: existing.environment,
      name: `${existing.name} (Rotated)`,
      prefix: newPrefix,
      secretHash: newSecretHash,
      status: "active",
      permissions: [...existing.permissions],
      modelRules: [...existing.modelRules],
      ipAllowlist: [...existing.ipAllowlist],
      rateLimits: existing.rateLimits ? [...existing.rateLimits] : undefined,
      spendingLimit: existing.spendingLimit
        ? { ...existing.spendingLimit }
        : null,
      createdBy: actorId,
      createdAt: now,
      updatedAt: now,
      expiresAt: existing.expiresAt,
      lastUsedAt: null,
      revokedAt: null,
      revokedBy: null,
    };

    const overlapMinutes = options?.overlapMinutes ?? 0;
    const { newRecord: persistedNew, oldRecord } = await this.repository.rotate(
      { organizationId, workspaceId, id, overlapMinutes },
      newRecord,
      actorId,
    );

    await this.events.invalidate(id);
    await this.events.invalidate(newId);
    await this.events.audit("api_key.rotated", persistedNew, actorId, {
      oldKeyId: id,
      overlapMinutes,
      reason: options?.reason,
    });
    await this.events.publish("api_key.rotated", persistedNew, actorId);

    return {
      newRecord: persistedNew,
      secret: newFullSecret,
      oldRecord,
    };
  }

  async authenticate(
    encodedOrInput: string | AccessInput,
    options?: {
      permission?: ApiKeyScope | undefined;
      model?: string | undefined;
      clientIp?: string | undefined;
      now?: Date | undefined;
    },
  ): Promise<AccessDecision> {
    const rawAuthorization =
      typeof encodedOrInput === "string"
        ? encodedOrInput
        : encodedOrInput.authorization;
    const clientIp =
      typeof encodedOrInput === "string"
        ? (options?.clientIp ?? "")
        : encodedOrInput.clientIp;
    const requiredPermission =
      typeof encodedOrInput === "string"
        ? options?.permission
        : encodedOrInput.permission;
    const model =
      typeof encodedOrInput === "string"
        ? options?.model
        : encodedOrInput.model;
    const now =
      (typeof encodedOrInput === "string"
        ? options?.now
        : encodedOrInput.now) ?? new Date();

    if (!rawAuthorization) {
      await this.events.securityEvent("gateway.authentication.failed", "low", {
        reason: "missing_api_key",
        clientIp,
      });
      return { allowed: false, code: "missing_api_key", status: 401 };
    }

    const token = rawAuthorization.startsWith("Bearer ")
      ? rawAuthorization.slice(7)
      : rawAuthorization;

    const parsed = parseApiKey(token);
    if (!parsed) {
      await this.events.securityEvent(
        "gateway.authentication.failed",
        "medium",
        {
          reason: "malformed_api_key",
          clientIp,
        },
      );
      return { allowed: false, code: "invalid_api_key", status: 401 };
    }

    const result = await this.repository.findByKeyId(parsed.keyId);
    if (!result) {
      await this.events.securityEvent(
        "gateway.authentication.failed",
        "medium",
        {
          reason: "unknown_key_id",
          clientIp,
        },
      );
      return { allowed: false, code: "invalid_api_key", status: 401 };
    }

    const { record, tenant } = result;

    if (!verifyApiKey(parsed.secret, record.secretHash, this.pepper)) {
      await this.events.securityEvent("gateway.authentication.failed", "high", {
        reason: "invalid_secret",
        apiKeyId: record.id,
        clientIp,
      });
      return { allowed: false, code: "invalid_api_key", status: 401 };
    }

    if (record.environment !== parsed.environment) {
      await this.events.securityEvent("gateway.authentication.failed", "high", {
        reason: "environment_mismatch",
        apiKeyId: record.id,
        keyEnvironment: record.environment,
        tokenEnvironment: parsed.environment,
        clientIp,
      });
      return { allowed: false, code: "invalid_api_key", status: 401 };
    }

    const effectiveStatus = resolveEffectiveStatus(record, now);
    if (effectiveStatus === "revoked") {
      await this.events.securityEvent("gateway.authentication.failed", "high", {
        reason: "revoked_api_key",
        apiKeyId: record.id,
        clientIp,
      });
      return { allowed: false, code: "revoked_api_key", status: 401 };
    }
    if (effectiveStatus === "expired") {
      await this.events.securityEvent(
        "gateway.authentication.failed",
        "medium",
        {
          reason: "expired_api_key",
          apiKeyId: record.id,
          clientIp,
        },
      );
      return { allowed: false, code: "expired_api_key", status: 401 };
    }
    if (effectiveStatus !== "active") {
      await this.events.securityEvent(
        "gateway.authentication.failed",
        "medium",
        {
          reason: "disabled_api_key",
          apiKeyId: record.id,
          clientIp,
        },
      );
      return { allowed: false, code: "invalid_api_key", status: 401 };
    }

    if (["suspended", "archived"].includes(tenant.organizationStatus)) {
      await this.events.securityEvent("gateway.permission.denied", "high", {
        reason: "organization_suspended",
        apiKeyId: record.id,
        organizationId: record.organizationId,
      });
      return { allowed: false, code: "organization_suspended", status: 403 };
    }
    if (["suspended", "archived"].includes(tenant.workspaceStatus)) {
      await this.events.securityEvent("gateway.permission.denied", "high", {
        reason: "workspace_suspended",
        apiKeyId: record.id,
        workspaceId: record.workspaceId,
      });
      return { allowed: false, code: "workspace_suspended", status: 403 };
    }
    if (tenant.environmentStatus !== "active") {
      await this.events.securityEvent("gateway.permission.denied", "medium", {
        reason: "environment_disabled",
        apiKeyId: record.id,
        environmentId: record.environmentId,
      });
      return { allowed: false, code: "environment_disabled", status: 403 };
    }

    if (!isIpAllowed(clientIp, record.ipAllowlist)) {
      await this.events.securityEvent("gateway.permission.denied", "high", {
        reason: "ip_not_allowed",
        apiKeyId: record.id,
        clientIp,
      });
      return { allowed: false, code: "ip_not_allowed", status: 403 };
    }

    if (
      requiredPermission &&
      !record.permissions.includes(requiredPermission)
    ) {
      await this.events.securityEvent("gateway.permission.denied", "medium", {
        reason: "permission_denied",
        apiKeyId: record.id,
        requiredPermission,
        keyPermissions: record.permissions,
      });
      return { allowed: false, code: "permission_denied", status: 403 };
    }

    if (model && !modelAllowed(record.modelRules, model)) {
      await this.events.securityEvent("gateway.permission.denied", "medium", {
        reason: "model_not_allowed",
        apiKeyId: record.id,
        model,
      });
      return { allowed: false, code: "model_not_allowed", status: 403 };
    }

    const context: MachineAuthContext = {
      actorType: "apiKey",
      apiKeyId: record.id,
      organizationId: record.organizationId,
      workspaceId: record.workspaceId,
      environmentId: record.environmentId,
      environment: record.environment,
      name: record.name,
      permissions: record.permissions,
      modelRules: record.modelRules,
      ipAllowlist: record.ipAllowlist,
      rateLimits: record.rateLimits ?? [],
      spendingLimit: record.spendingLimit,
      createdBy: record.createdBy,
      createdAt: record.createdAt,
      expiresAt: record.expiresAt,
      lastUsedAt: record.lastUsedAt,
    };

    return { allowed: true, context, record };
  }

  async recordLastUsed(id: string, timestamp = new Date()): Promise<void> {
    try {
      await this.repository.updateLastUsed(id, timestamp);
    } catch {
      // Non-blocking
    }
  }

  async updatePermissions(
    organizationId: string,
    workspaceId: string,
    id: string,
    permissions: readonly ApiKeyScope[],
    actorId: string,
    creatorCapabilities?: ReadonlySet<string>,
  ): Promise<void> {
    const record = await this.repository.findById(
      organizationId,
      workspaceId,
      id,
    );
    if (!record) throw new Error("API key not found");
    if (creatorCapabilities) {
      const delegation = validateDelegation(creatorCapabilities, permissions);
      if (!delegation.valid) {
        throw new Error(
          `Unauthorized scopes: ${delegation.unauthorizedScopes.join(", ")}`,
        );
      }
    }
    await this.repository.updatePermissions(id, permissions);
    await this.events.invalidate(id);
    await this.events.audit("api_key.permissions.updated", record, actorId, {
      permissions,
    });
  }

  async updateModelRules(
    organizationId: string,
    workspaceId: string,
    id: string,
    modelRules: readonly ModelRule[],
    actorId: string,
  ): Promise<void> {
    const record = await this.repository.findById(
      organizationId,
      workspaceId,
      id,
    );
    if (!record) throw new Error("API key not found");
    await this.repository.updateModelRules(id, modelRules);
    await this.events.invalidate(id);
    await this.events.audit("api_key.model_rules.updated", record, actorId, {
      modelRules,
    });
  }

  async updateRateLimits(
    organizationId: string,
    workspaceId: string,
    id: string,
    rateLimits: readonly ApiKeyRateLimit[],
    actorId: string,
  ): Promise<void> {
    const record = await this.repository.findById(
      organizationId,
      workspaceId,
      id,
    );
    if (!record) throw new Error("API key not found");
    await this.repository.updateRateLimits(id, rateLimits);
    await this.events.invalidate(id);
    await this.events.audit("api_key.rate_limits.updated", record, actorId, {
      rateLimits,
    });
  }

  async updateSpendingLimit(
    organizationId: string,
    workspaceId: string,
    id: string,
    spendingLimit: ApiKeySpendingLimit | null,
    actorId: string,
  ): Promise<void> {
    const record = await this.repository.findById(
      organizationId,
      workspaceId,
      id,
    );
    if (!record) throw new Error("API key not found");
    await this.repository.updateSpendingLimit(id, spendingLimit);
    await this.events.invalidate(id);
    await this.events.audit("api_key.spending_limit.updated", record, actorId, {
      spendingLimit,
    });
  }

  async updateIpAllowlist(
    organizationId: string,
    workspaceId: string,
    id: string,
    ipAllowlist: readonly string[],
    actorId: string,
  ): Promise<void> {
    const record = await this.repository.findById(
      organizationId,
      workspaceId,
      id,
    );
    if (!record) throw new Error("API key not found");
    await this.repository.updateIpAllowlist(id, ipAllowlist);
    await this.events.invalidate(id);
    await this.events.audit("api_key.ip_allowlist.updated", record, actorId, {
      ipAllowlist,
    });
  }
}
