import {
  type CreateRoutingPolicyRequest,
  type UpdateRoutingPolicyRequest,
  type RoutingPolicyV2,
} from "@growx/contracts";
import { generateId } from "@growx/ids";
import type { MachineAuthContext } from "@growx/api-key-service";
import type { RoutingStateSnapshotService } from "./routing-state-snapshot-service.js";

export class PolicyManagementService {
  constructor(
    private readonly snapshotService: RoutingStateSnapshotService,
    private readonly auditService?: any | undefined,
  ) {}

  public async createPolicy(
    auth: MachineAuthContext,
    request: CreateRoutingPolicyRequest,
  ): Promise<RoutingPolicyV2> {
    const id = generateId("rpol");
    const now = new Date();

    const policy: RoutingPolicyV2 = {
      id,
      organizationId: request.organizationId || auth.organizationId,
      workspaceId: request.workspaceId || auth.workspaceId,
      name: request.name,
      objective: request.objective || "balanced",
      weights: request.weights || {
        latency: 0.3,
        cost: 0.25,
        reliability: 0.25,
        capacity: 0.1,
        locality: 0.1,
      },
      constraints: request.constraints || {
        allowCanaryRoutes: true,
        explorationRate: 0.02,
      },
      version: 1,
      status: "active",
      effectiveFrom: now,
      effectiveUntil: null,
      createdAt: now,
      updatedAt: now,
    };

    this.snapshotService.setPolicy(policy);

    if (this.auditService) {
      await this.auditService.recordEvent?.({
        action: "routing.policy.created",
        organizationId: auth.organizationId,
        workspaceId: auth.workspaceId,
        actorId: auth.apiKeyId,
        metadata: { policyId: id, name: policy.name },
      });
    }

    return policy;
  }

  public async getPolicy(
    _auth: MachineAuthContext,
    id: string,
  ): Promise<RoutingPolicyV2 | null> {
    return this.snapshotService.getPolicy(id) ?? null;
  }

  public async listPolicies(
    _auth: MachineAuthContext,
  ): Promise<RoutingPolicyV2[]> {
    return this.snapshotService.listPolicies();
  }

  public async updatePolicy(
    auth: MachineAuthContext,
    id: string,
    request: UpdateRoutingPolicyRequest,
  ): Promise<RoutingPolicyV2> {
    const existing = this.snapshotService.getPolicy(id);
    if (!existing) {
      throw new Error(`Routing policy '${id}' not found`);
    }

    const updated: RoutingPolicyV2 = {
      ...existing,
      name: request.name ?? existing.name,
      objective: request.objective ?? existing.objective,
      weights: request.weights ?? existing.weights,
      constraints: request.constraints ?? existing.constraints,
      status: request.status ?? existing.status,
      version: existing.version + 1,
      updatedAt: new Date(),
    };

    this.snapshotService.setPolicy(updated);

    if (this.auditService) {
      await this.auditService.recordEvent?.({
        action: "routing.policy.updated",
        organizationId: auth.organizationId,
        workspaceId: auth.workspaceId,
        actorId: auth.apiKeyId,
        metadata: { policyId: id, version: updated.version },
      });
    }

    return updated;
  }

  public async activatePolicy(
    auth: MachineAuthContext,
    id: string,
  ): Promise<RoutingPolicyV2> {
    return this.updatePolicy(auth, id, { status: "active" });
  }

  public async retirePolicy(
    auth: MachineAuthContext,
    id: string,
  ): Promise<RoutingPolicyV2> {
    return this.updatePolicy(auth, id, { status: "retired" });
  }
}
