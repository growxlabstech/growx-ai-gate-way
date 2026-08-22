import { createPublicId } from "@growx/ids";
import {
  GrowXProviderError,
  type CreateProviderPoolRequest,
  type AddPoolMemberRequest,
  type ProviderCredentialPool,
  type ProviderCredentialPoolMember,
} from "@growx/contracts";
import type { IProviderRepository } from "../application/repository.js";
import type { IProviderEvents } from "../application/events.js";

export class ProviderPoolService {
  constructor(
    private readonly repository: IProviderRepository,
    private readonly events: IProviderEvents,
  ) {}

  public async createPool(
    input: CreateProviderPoolRequest,
    operatorId: string,
    requestId?: string,
  ): Promise<ProviderCredentialPool> {
    const now = new Date();
    const pool: ProviderCredentialPool = {
      id: `ppool_${createPublicId("key").slice(4)}`,
      providerId: input.providerId,
      name: input.name,
      environment: input.environment || "production",
      ...(input.region ? { region: input.region } : {}),
      ...(input.workloadType ? { workloadType: input.workloadType } : {}),
      status: "active",
      strategy: input.strategy || "capacity_aware",
      metadata: input.metadata || {},
      createdAt: now,
      updatedAt: now,
    };

    const created = await this.repository.createPool(pool);
    await this.events.emitSecurityEvent(
      "provider.pool.created",
      { poolId: created.id, providerId: pool.providerId },
      requestId,
    );
    return created;
  }

  public async addMember(
    poolId: string,
    input: AddPoolMemberRequest,
    operatorId: string,
    requestId?: string,
  ): Promise<ProviderCredentialPoolMember> {
    const pool = await this.repository.getPoolById(poolId);
    if (!pool) {
      throw new GrowXProviderError(
        "provider_invalid_request",
        `Pool '${poolId}' not found`,
        false,
        404,
      );
    }

    const now = new Date();
    const member: ProviderCredentialPoolMember = {
      id: `ppmem_${createPublicId("key").slice(4)}`,
      poolId,
      providerAccountId: input.providerAccountId,
      credentialId: input.credentialId,
      weight: input.weight ?? 100,
      priority: input.priority ?? 100,
      ...(input.maxConcurrency ? { maxConcurrency: input.maxConcurrency } : {}),
      status: "active",
      createdAt: now,
      updatedAt: now,
    };

    const created = await this.repository.addPoolMember(member);
    await this.events.emitSecurityEvent(
      "provider.pool.member_added",
      { poolId, memberId: created.id },
      requestId,
    );
    return created;
  }

  public async removeMember(
    poolId: string,
    memberId: string,
    operatorId: string,
    requestId?: string,
  ): Promise<void> {
    await this.repository.removePoolMember(memberId);
    await this.events.emitSecurityEvent(
      "provider.pool.member_removed",
      { poolId, memberId },
      requestId,
    );
  }

  public async getPool(poolId: string): Promise<ProviderCredentialPool> {
    const pool = await this.repository.getPoolById(poolId);
    if (!pool) {
      throw new GrowXProviderError(
        "provider_invalid_request",
        `Pool '${poolId}' not found`,
        false,
        404,
      );
    }
    const members = await this.repository.listPoolMembers(poolId);
    return { ...pool, members };
  }

  public async listPools(
    providerId?: string,
  ): Promise<ProviderCredentialPool[]> {
    return this.repository.listPools(providerId);
  }
}
