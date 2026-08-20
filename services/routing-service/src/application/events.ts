import type { RoutingPolicy } from "../domain/types.js";

export interface IRoutingEvents {
  emitPolicyCreated(
    policy: RoutingPolicy,
    actorId?: string | undefined,
    requestId?: string | undefined
  ): Promise<void>;

  emitPolicyUpdated(
    policy: RoutingPolicy,
    actorId?: string | undefined,
    requestId?: string | undefined
  ): Promise<void>;

  emitPolicyDisabled(
    policyId: string,
    organizationId?: string | null | undefined,
    workspaceId?: string | null | undefined,
    actorId?: string | undefined,
    requestId?: string | undefined
  ): Promise<void>;

  emitGlobalPolicyUpdated(
    policy: RoutingPolicy,
    actorId?: string | undefined,
    requestId?: string | undefined
  ): Promise<void>;

  emitSecurityEvent(
    type: string,
    data: Record<string, unknown>,
    requestId?: string | undefined
  ): Promise<void>;
}
