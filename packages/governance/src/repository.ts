import type {
  DataResource,
  DataLineage,
  RetentionPolicy,
  RetentionHold,
  DeletionRequest,
  DeletionTask,
  DeletionEvidence,
  DataExportRequest,
  ProviderDataPolicy,
  DataCategory,
} from "@growx/contracts";

export interface IGovernanceRepository {
  registerResource(resource: DataResource): Promise<void>;
  getResource(id: string): Promise<DataResource | null>;
  findExpiredResources(options: { before: Date; limit: number }): Promise<DataResource[]>;
  findResourcesByScope(options: {
    organizationId?: string;
    workspaceId?: string;
    userId?: string;
    category?: DataCategory;
    limit: number;
  }): Promise<DataResource[]>;
  markResourceDeleted(id: string): Promise<void>;

  createPolicy(policy: RetentionPolicy): Promise<void>;
  getPolicy(id: string): Promise<RetentionPolicy | null>;
  listPolicies(scope?: string, scopeId?: string): Promise<RetentionPolicy[]>;

  createHold(hold: RetentionHold): Promise<void>;
  findActiveHolds(options: {
    organizationId: string;
    workspaceId?: string;
    category?: DataCategory;
    resourceId?: string;
  }): Promise<RetentionHold[]>;

  createDeletionRequest(req: DeletionRequest): Promise<void>;
  getDeletionRequest(id: string): Promise<DeletionRequest | null>;
  updateDeletionRequest(id: string, patch: Partial<DeletionRequest>): Promise<DeletionRequest>;
  listDeletionRequests(organizationId?: string): Promise<DeletionRequest[]>;

  createDeletionTask(task: DeletionTask): Promise<void>;
  updateDeletionTask(id: string, patch: Partial<DeletionTask>): Promise<DeletionTask>;
  listDeletionTasks(deletionRequestId: string): Promise<DeletionTask[]>;

  recordEvidence(evidence: DeletionEvidence): Promise<void>;
  listEvidence(deletionRequestId: string): Promise<DeletionEvidence[]>;

  createExportRequest(req: DataExportRequest): Promise<void>;
  getExportRequest(id: string): Promise<DataExportRequest | null>;
  updateExportRequest(id: string, patch: Partial<DataExportRequest>): Promise<DataExportRequest>;

  getProviderPolicy(providerId: string, accountId?: string): Promise<ProviderDataPolicy | null>;
  setProviderPolicy(policy: ProviderDataPolicy): Promise<void>;
}

export class InMemoryGovernanceRepository implements IGovernanceRepository {
  private resources = new Map<string, DataResource>();
  private policies = new Map<string, RetentionPolicy>();
  private holds = new Map<string, RetentionHold>();
  private deletionRequests = new Map<string, DeletionRequest>();
  private deletionTasks = new Map<string, DeletionTask>();
  private evidence = new Map<string, DeletionEvidence>();
  private exportRequests = new Map<string, DataExportRequest>();
  private providerPolicies = new Map<string, ProviderDataPolicy>();

  public async registerResource(resource: DataResource): Promise<void> {
    this.resources.set(resource.id, { ...resource });
  }

  public async getResource(id: string): Promise<DataResource | null> {
    const res = this.resources.get(id);
    return res ? { ...res } : null;
  }

  public async findExpiredResources(options: { before: Date; limit: number }): Promise<DataResource[]> {
    const results: DataResource[] = [];
    for (const res of this.resources.values()) {
      if (results.length >= options.limit) break;
      if (!res.deletedAt && res.expiresAt && res.expiresAt <= options.before) {
        results.push({ ...res });
      }
    }
    return results;
  }

  public async findResourcesByScope(options: {
    organizationId?: string;
    workspaceId?: string;
    userId?: string;
    category?: DataCategory;
    limit: number;
  }): Promise<DataResource[]> {
    const results: DataResource[] = [];
    for (const res of this.resources.values()) {
      if (results.length >= options.limit) break;
      if (res.deletedAt) continue;
      if (options.organizationId && res.organizationId !== options.organizationId) continue;
      if (options.workspaceId && res.workspaceId !== options.workspaceId) continue;
      if (options.userId && res.userId !== options.userId) continue;
      if (options.category && res.dataCategory !== options.category) continue;
      results.push({ ...res });
    }
    return results;
  }

  public async markResourceDeleted(id: string): Promise<void> {
    const res = this.resources.get(id);
    if (res) {
      this.resources.set(id, { ...res, deletedAt: new Date() });
    }
  }

  public async createPolicy(policy: RetentionPolicy): Promise<void> {
    this.policies.set(policy.id, { ...policy });
  }

  public async getPolicy(id: string): Promise<RetentionPolicy | null> {
    const pol = this.policies.get(id);
    return pol ? { ...pol } : null;
  }

  public async listPolicies(scope?: string, scopeId?: string): Promise<RetentionPolicy[]> {
    return Array.from(this.policies.values()).filter((p) => {
      if (scope && p.scope !== scope) return false;
      if (scopeId && p.scopeId !== scopeId) return false;
      return p.status === "active";
    });
  }

  public async createHold(hold: RetentionHold): Promise<void> {
    this.holds.set(hold.id, { ...hold });
  }

  public async findActiveHolds(options: {
    organizationId: string;
    workspaceId?: string;
    category?: DataCategory;
    resourceId?: string;
  }): Promise<RetentionHold[]> {
    const now = new Date();
    return Array.from(this.holds.values()).filter((h) => {
      if (h.status !== "active") return false;
      if (h.organizationId !== options.organizationId) return false;
      if (h.workspaceId && options.workspaceId && h.workspaceId !== options.workspaceId) return false;
      if (h.category && options.category && h.category !== options.category) return false;
      if (h.resourceId && options.resourceId && h.resourceId !== options.resourceId) return false;
      if (h.expiresAt && h.expiresAt < now) return false;
      return true;
    });
  }

  public async createDeletionRequest(req: DeletionRequest): Promise<void> {
    this.deletionRequests.set(req.id, { ...req });
  }

  public async getDeletionRequest(id: string): Promise<DeletionRequest | null> {
    const req = this.deletionRequests.get(id);
    return req ? { ...req } : null;
  }

  public async updateDeletionRequest(id: string, patch: Partial<DeletionRequest>): Promise<DeletionRequest> {
    const existing = this.deletionRequests.get(id);
    if (!existing) throw new Error(`DeletionRequest '${id}' not found`);
    const updated = { ...existing, ...patch };
    this.deletionRequests.set(id, updated);
    return { ...updated };
  }

  public async listDeletionRequests(organizationId?: string): Promise<DeletionRequest[]> {
    return Array.from(this.deletionRequests.values()).filter((r) => {
      if (organizationId && r.organizationId !== organizationId) return false;
      return true;
    });
  }

  public async createDeletionTask(task: DeletionTask): Promise<void> {
    this.deletionTasks.set(task.id, { ...task });
  }

  public async updateDeletionTask(id: string, patch: Partial<DeletionTask>): Promise<DeletionTask> {
    const existing = this.deletionTasks.get(id);
    if (!existing) throw new Error(`DeletionTask '${id}' not found`);
    const updated = { ...existing, ...patch };
    this.deletionTasks.set(id, updated);
    return { ...updated };
  }

  public async listDeletionTasks(deletionRequestId: string): Promise<DeletionTask[]> {
    return Array.from(this.deletionTasks.values()).filter((t) => t.deletionRequestId === deletionRequestId);
  }

  public async recordEvidence(evidence: DeletionEvidence): Promise<void> {
    this.evidence.set(evidence.id, { ...evidence });
  }

  public async listEvidence(deletionRequestId: string): Promise<DeletionEvidence[]> {
    return Array.from(this.evidence.values()).filter((e) => e.deletionRequestId === deletionRequestId);
  }

  public async createExportRequest(req: DataExportRequest): Promise<void> {
    this.exportRequests.set(req.id, { ...req });
  }

  public async getExportRequest(id: string): Promise<DataExportRequest | null> {
    const req = this.exportRequests.get(id);
    return req ? { ...req } : null;
  }

  public async updateExportRequest(id: string, patch: Partial<DataExportRequest>): Promise<DataExportRequest> {
    const existing = this.exportRequests.get(id);
    if (!existing) throw new Error(`ExportRequest '${id}' not found`);
    const updated = { ...existing, ...patch };
    this.exportRequests.set(id, updated);
    return { ...updated };
  }

  public async getProviderPolicy(providerId: string, accountId?: string): Promise<ProviderDataPolicy | null> {
    const key = accountId ? `${providerId}:${accountId}` : providerId;
    const pol = this.providerPolicies.get(key) || this.providerPolicies.get(providerId);
    return pol ? { ...pol } : null;
  }

  public async setProviderPolicy(policy: ProviderDataPolicy): Promise<void> {
    const key = policy.accountId ? `${policy.providerId}:${policy.accountId}` : policy.providerId;
    this.providerPolicies.set(key, { ...policy });
  }
}
