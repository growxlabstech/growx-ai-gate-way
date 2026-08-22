import type { RoutingDecision, RoutingPolicy } from "../domain/types.js";

export interface RoutingDecisionListFilter {
  organizationId?: string | undefined;
  workspaceId?: string | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
}

export interface IRoutingRepository {
  saveDecision(decision: RoutingDecision): Promise<void>;
  getDecisionByRequestId(requestId: string): Promise<RoutingDecision | null>;
  getDecision(id: string): Promise<RoutingDecision | null>;
  listDecisions(
    filter?: RoutingDecisionListFilter | undefined,
  ): Promise<RoutingDecision[]>;

  getPolicy(
    organizationId?: string | null | undefined,
    workspaceId?: string | null | undefined,
  ): Promise<RoutingPolicy | null>;
  getPolicyById(id: string): Promise<RoutingPolicy | null>;
  savePolicy(policy: RoutingPolicy): Promise<void>;
  updatePolicy(id: string, updates: Partial<RoutingPolicy>): Promise<void>;
  listPolicies(scope?: {
    organizationId?: string | undefined;
    workspaceId?: string | undefined;
  }): Promise<RoutingPolicy[]>;
  getGlobalPolicy(): Promise<RoutingPolicy | null>;
  saveGlobalPolicy(policy: RoutingPolicy): Promise<void>;
}
