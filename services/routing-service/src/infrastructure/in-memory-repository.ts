import type {
  IRoutingRepository,
  RoutingDecisionListFilter,
} from "../application/repository.js";
import type { RoutingDecision, RoutingPolicy } from "../domain/types.js";
import { DEFAULT_GLOBAL_POLICY } from "@growx/routing";

export class InMemoryRoutingRepository implements IRoutingRepository {
  public decisions = new Map<string, RoutingDecision>();
  public policies = new Map<string, RoutingPolicy>();
  public globalPolicy: RoutingPolicy | null = { ...DEFAULT_GLOBAL_POLICY };

  async saveDecision(decision: RoutingDecision): Promise<void> {
    this.decisions.set(decision.id, { ...decision });
  }

  async getDecisionByRequestId(
    requestId: string,
  ): Promise<RoutingDecision | null> {
    for (const d of this.decisions.values()) {
      if (d.requestId === requestId) {
        return { ...d };
      }
    }
    return null;
  }

  async getDecision(id: string): Promise<RoutingDecision | null> {
    const d = this.decisions.get(id);
    return d ? { ...d } : null;
  }

  async listDecisions(
    filter?: RoutingDecisionListFilter | undefined,
  ): Promise<RoutingDecision[]> {
    let items = Array.from(this.decisions.values());
    if (filter?.limit) {
      items = items.slice(0, filter.limit);
    }
    return items.map((d) => ({ ...d }));
  }

  async getPolicy(
    organizationId?: string | null | undefined,
    workspaceId?: string | null | undefined,
  ): Promise<RoutingPolicy | null> {
    for (const p of this.policies.values()) {
      if (
        p.organizationId === (organizationId ?? null) &&
        p.workspaceId === (workspaceId ?? null)
      ) {
        return { ...p };
      }
    }
    return null;
  }

  async getPolicyById(id: string): Promise<RoutingPolicy | null> {
    const p = this.policies.get(id);
    return p ? { ...p } : null;
  }

  async savePolicy(policy: RoutingPolicy): Promise<void> {
    this.policies.set(policy.id, { ...policy });
  }

  async updatePolicy(
    id: string,
    updates: Partial<RoutingPolicy>,
  ): Promise<void> {
    const existing = this.policies.get(id);
    if (existing) {
      this.policies.set(id, {
        ...existing,
        ...updates,
        updatedAt: new Date(),
        version: existing.version + 1,
      });
    }
  }

  async listPolicies(scope?: {
    organizationId?: string | undefined;
    workspaceId?: string | undefined;
  }): Promise<RoutingPolicy[]> {
    let list = Array.from(this.policies.values());
    if (scope?.organizationId) {
      list = list.filter((p) => p.organizationId === scope.organizationId);
    }
    if (scope?.workspaceId) {
      list = list.filter((p) => p.workspaceId === scope.workspaceId);
    }
    return list.map((p) => ({ ...p }));
  }

  async getGlobalPolicy(): Promise<RoutingPolicy | null> {
    return this.globalPolicy ? { ...this.globalPolicy } : null;
  }

  async saveGlobalPolicy(policy: RoutingPolicy): Promise<void> {
    this.globalPolicy = { ...policy };
  }

  clear(): void {
    this.decisions.clear();
    this.policies.clear();
    this.globalPolicy = { ...DEFAULT_GLOBAL_POLICY };
  }
}
