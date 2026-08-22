import { describe, it, expect } from "vitest";
import { InMemoryProviderRepository } from "../../src/infrastructure/in-memory-repository.js";
import { InMemoryProviderEvents } from "../../src/infrastructure/events.js";
import { ProviderPoolService } from "../../src/vault/provider-pool-service.js";

describe("Provider Credential Pooling", () => {
  const repo = new InMemoryProviderRepository();
  const events = new InMemoryProviderEvents();
  const service = new ProviderPoolService(repo, events);

  it("creates and manages regional and workload-specific credential pools", async () => {
    // 1. Create Pool
    const pool = await service.createPool(
      {
        providerId: "openai",
        name: "OpenAI Batch US Pool",
        region: "us",
        workloadType: "batch",
        strategy: "weighted",
        environment: "production",
        metadata: {},
      },
      "admin",
    );

    expect(pool.id).toBeDefined();
    expect(pool.strategy).toBe("weighted");

    // 2. Add Pool Member
    const member = await service.addMember(
      pool.id,
      {
        providerAccountId: "pacc_openai_batch",
        credentialId: "pcred_openai_batch_1",
        weight: 80,
        priority: 100,
        maxConcurrency: 50,
      },
      "admin",
    );

    expect(member.poolId).toBe(pool.id);
    expect(member.maxConcurrency).toBe(50);

    // 3. List Pool
    const retrieved = await service.getPool(pool.id);
    expect(retrieved.members?.length).toBe(1);

    // 4. Remove Member
    await service.removeMember(pool.id, member.id, "admin");
    const afterDel = await service.getPool(pool.id);
    expect(afterDel.members?.length).toBe(0);
  });
});
