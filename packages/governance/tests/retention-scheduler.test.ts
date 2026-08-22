import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryGovernanceRepository } from "../src/repository.js";
import { RetentionScheduler } from "../src/retention-scheduler.js";
import { GovernanceDeletionOrchestrator } from "../src/deletion-orchestrator.js";
import { MockDomainDeletionProcessor } from "../src/processors/deletion-processor.js";
import type { DataResource } from "@growx/contracts";

describe("RetentionScheduler", () => {
  let repo: InMemoryGovernanceRepository;
  let orchestrator: GovernanceDeletionOrchestrator;
  let scheduler: RetentionScheduler;

  beforeEach(() => {
    repo = new InMemoryGovernanceRepository();
    orchestrator = new GovernanceDeletionOrchestrator(repo);
    orchestrator.registerProcessor(new MockDomainDeletionProcessor("postgres"));
    scheduler = new RetentionScheduler(repo, orchestrator);
  });

  it("scans expired resources and enqueues deletion", async () => {
    const expiredRes: DataResource = {
      id: "dres_exp_1",
      organizationId: "org_test",
      resourceType: "file",
      resourceId: "file_123",
      dataClass: "CUSTOMER_CONTENT",
      dataCategory: "file",
      region: "GLOBAL",
      createdAt: new Date(Date.now() - 40 * 86400 * 1000),
      expiresAt: new Date(Date.now() - 10 * 86400 * 1000), // expired 10 days ago
    };
    await repo.registerResource(expiredRes);

    const scheduledCount = await scheduler.scanAndPurgeExpired();
    expect(scheduledCount).toBe(1);

    const updatedRes = await repo.getResource("dres_exp_1");
    expect(updatedRes?.deletedAt).toBeDefined();
  });
});
