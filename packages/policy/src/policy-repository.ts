import type {
  PolicyDefinition,
  PolicyEntity,
  PolicyScopeType,
  PolicyStatus,
  PolicyVersionEntity,
} from "./types.js";

export interface CreatePolicyInput {
  scopeType: PolicyScopeType;
  scopeId?: string | null | undefined;
  name: string;
  description?: string | undefined;
  status?: PolicyStatus | undefined;
  definition?: PolicyDefinition | undefined;
  createdBy: string;
}

export interface UpdatePolicyInput {
  name?: string | undefined;
  description?: string | undefined;
  status?: PolicyStatus | undefined;
  expectedVersion?: number | undefined;
}

export interface IPolicyRepository {
  createPolicy(
    input: CreatePolicyInput,
  ): Promise<{ policy: PolicyEntity; version: PolicyVersionEntity }>;
  updatePolicy(
    id: string,
    input: UpdatePolicyInput,
    actorId: string,
  ): Promise<PolicyEntity>;
  createVersion(
    policyId: string,
    definition: PolicyDefinition,
    actorId: string,
    options?: { effectiveFrom?: Date | null; effectiveTo?: Date | null },
  ): Promise<PolicyVersionEntity>;
  activateVersion(
    policyId: string,
    versionNumber: number,
    actorId: string,
  ): Promise<PolicyEntity>;
  getPolicy(id: string): Promise<PolicyEntity | null>;
  getPolicyByScope(
    scopeType: PolicyScopeType,
    scopeId?: string | null,
  ): Promise<PolicyEntity | null>;
  getActiveVersion(policyId: string): Promise<PolicyVersionEntity | null>;
  getVersion(
    policyId: string,
    versionNumber: number,
  ): Promise<PolicyVersionEntity | null>;
  listPolicies(
    scopeType?: PolicyScopeType,
    scopeId?: string | null,
  ): Promise<PolicyEntity[]>;
  listVersions(policyId: string): Promise<PolicyVersionEntity[]>;
}

export class InMemoryPolicyRepository implements IPolicyRepository {
  private readonly policies = new Map<string, PolicyEntity>();
  private readonly versions = new Map<string, PolicyVersionEntity[]>();
  private idCounter = 1;

  constructor() {
    this.seedDefaultGlobalPolicy();
  }

  private seedDefaultGlobalPolicy(): void {
    const globalPolicy: PolicyEntity = {
      id: "pol_global_baseline",
      scopeType: "global",
      scopeId: null,
      name: "Global Platform Baseline Policy",
      description: "Default platform baseline governance policy",
      status: "active",
      activeVersion: 1,
      createdBy: "system",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const globalVersion: PolicyVersionEntity = {
      id: "ver_global_baseline_v1",
      policyId: globalPolicy.id,
      version: 1,
      definition: {
        rules: [],
        metadata: { isSystemBaseline: true },
      },
      effectiveFrom: new Date(0),
      effectiveTo: null,
      createdBy: "system",
      createdAt: new Date(),
    };

    this.policies.set(globalPolicy.id, globalPolicy);
    this.versions.set(globalPolicy.id, [globalVersion]);
  }

  async createPolicy(
    input: CreatePolicyInput,
  ): Promise<{ policy: PolicyEntity; version: PolicyVersionEntity }> {
    const sId = input.scopeId ?? null;
    const existing = await this.getPolicyByScope(input.scopeType, sId);
    const now = new Date();

    if (existing) {
      const vers = this.versions.get(existing.id) ?? [];
      const nextVersionNum =
        vers.length > 0 ? Math.max(...vers.map((v) => v.version)) + 1 : 1;
      const version: PolicyVersionEntity = {
        id: `ver_${existing.id}_v${nextVersionNum}`,
        policyId: existing.id,
        version: nextVersionNum,
        definition: input.definition ?? { rules: [] },
        effectiveFrom: now,
        effectiveTo: null,
        createdBy: input.createdBy,
        createdAt: now,
      };
      vers.push(version);
      this.versions.set(existing.id, vers);

      existing.name = input.name;
      if (input.description !== undefined)
        existing.description = input.description;
      existing.activeVersion = nextVersionNum;
      existing.status = input.status ?? "active";
      existing.updatedAt = now;
      this.policies.set(existing.id, existing);

      return { policy: existing, version };
    }

    const id = `pol_${this.idCounter++}_${Date.now()}`;
    const status = input.status ?? "active";

    const policy: PolicyEntity = {
      id,
      scopeType: input.scopeType,
      scopeId: sId,
      name: input.name,
      description: input.description,
      status,
      activeVersion: 1,
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
    };

    const version: PolicyVersionEntity = {
      id: `ver_${id}_v1`,
      policyId: id,
      version: 1,
      definition: input.definition ?? { rules: [] },
      effectiveFrom: now,
      effectiveTo: null,
      createdBy: input.createdBy,
      createdAt: now,
    };

    this.policies.set(id, policy);
    this.versions.set(id, [version]);

    return { policy, version };
  }

  async updatePolicy(
    id: string,
    input: UpdatePolicyInput,
    actorId: string,
  ): Promise<PolicyEntity> {
    const existing = this.policies.get(id);
    if (!existing) {
      throw new Error(`Policy '${id}' not found`);
    }

    if (
      input.expectedVersion !== undefined &&
      existing.activeVersion !== input.expectedVersion
    ) {
      throw new Error(
        `Optimistic concurrency conflict: policy '${id}' active version is ${existing.activeVersion}, expected ${input.expectedVersion}`,
      );
    }

    const updated: PolicyEntity = {
      ...existing,
      name: input.name ?? existing.name,
      description:
        input.description !== undefined
          ? input.description
          : existing.description,
      status: input.status ?? existing.status,
      updatedAt: new Date(),
    };

    this.policies.set(id, updated);
    return updated;
  }

  async createVersion(
    policyId: string,
    definition: PolicyDefinition,
    actorId: string,
    options?: { effectiveFrom?: Date | null; effectiveTo?: Date | null },
  ): Promise<PolicyVersionEntity> {
    const policy = this.policies.get(policyId);
    if (!policy) {
      throw new Error(`Policy '${policyId}' not found`);
    }

    const vers = this.versions.get(policyId) ?? [];
    const nextVersionNum =
      vers.length > 0 ? Math.max(...vers.map((v) => v.version)) + 1 : 1;

    const version: PolicyVersionEntity = {
      id: `ver_${policyId}_v${nextVersionNum}`,
      policyId,
      version: nextVersionNum,
      definition,
      effectiveFrom: options?.effectiveFrom ?? new Date(),
      effectiveTo: options?.effectiveTo ?? null,
      createdBy: actorId,
      createdAt: new Date(),
    };

    vers.push(version);
    this.versions.set(policyId, vers);

    return version;
  }

  async activateVersion(
    policyId: string,
    versionNumber: number,
    actorId: string,
  ): Promise<PolicyEntity> {
    const policy = this.policies.get(policyId);
    if (!policy) {
      throw new Error(`Policy '${policyId}' not found`);
    }

    const vers = this.versions.get(policyId) ?? [];
    const target = vers.find((v) => v.version === versionNumber);
    if (!target) {
      throw new Error(
        `Version ${versionNumber} not found for policy '${policyId}'`,
      );
    }

    const updated: PolicyEntity = {
      ...policy,
      activeVersion: versionNumber,
      status: "active",
      updatedAt: new Date(),
    };

    this.policies.set(policyId, updated);
    return updated;
  }

  async getPolicy(id: string): Promise<PolicyEntity | null> {
    return this.policies.get(id) ?? null;
  }

  async getPolicyByScope(
    scopeType: PolicyScopeType,
    scopeId?: string | null,
  ): Promise<PolicyEntity | null> {
    const sId = scopeId ?? null;
    for (const p of this.policies.values()) {
      if (
        p.scopeType === scopeType &&
        p.scopeId === sId &&
        p.status !== "archived"
      ) {
        return p;
      }
    }
    return null;
  }

  async getActiveVersion(
    policyId: string,
  ): Promise<PolicyVersionEntity | null> {
    const policy = this.policies.get(policyId);
    if (
      !policy ||
      policy.status === "disabled" ||
      policy.status === "archived"
    ) {
      return null;
    }

    const vers = this.versions.get(policyId) ?? [];
    return vers.find((v) => v.version === policy.activeVersion) ?? null;
  }

  async getVersion(
    policyId: string,
    versionNumber: number,
  ): Promise<PolicyVersionEntity | null> {
    const vers = this.versions.get(policyId) ?? [];
    return vers.find((v) => v.version === versionNumber) ?? null;
  }

  async listPolicies(
    scopeType?: PolicyScopeType,
    scopeId?: string | null,
  ): Promise<PolicyEntity[]> {
    const list: PolicyEntity[] = [];
    for (const p of this.policies.values()) {
      if (p.status === "archived") continue;
      if (scopeType && p.scopeType !== scopeType) continue;
      if (scopeId !== undefined && p.scopeId !== scopeId) continue;
      list.push(p);
    }
    return list;
  }

  async listVersions(policyId: string): Promise<PolicyVersionEntity[]> {
    return this.versions.get(policyId) ?? [];
  }
}
