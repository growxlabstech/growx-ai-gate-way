import { describe, it, expect, beforeEach, vi } from "vitest";
import { InMemoryGovernanceRepository } from "../src/repository.js";
import { GovernanceReconciler } from "../src/reconciler.js";
import { GovernanceDeletionOrchestrator } from "../src/deletion-orchestrator.js";
import type { DeletionRequest } from "@growx/contracts";

describe("GovernanceReconciler", () => {
  let repo: InMemoryGovernanceRepository;
  let orchestrator: GovernanceDeletionOrchestrator;
  let reconciler: GovernanceReconciler;

  beforeEach(() => {
    repo = new InMemoryGovernanceRepository();
    orchestrator = new GovernanceDeletionOrchestrator(repo);
    vi.spyOn(orchestrator, "executeDeletion").mockResolvedValue({} as any);
    reconciler = new GovernanceReconciler(repo, orchestrator);
  });

  it("detects and retries stuck deletion requests", async () => {
    const stuckReq: DeletionRequest = {
      id: "dreq_stuck_1",
      organizationId: "org_test",
      requestedBy: "usr_admin",
      scope: "organization",
      status: "RUNNING",
      createdAt: new Date(Date.now() - 600_000), // 10 mins ago
    };
    await repo.createDeletionRequest(stuckReq);

    const reconciledCount = await reconciler.reconcileStuckDeletions(300_000);
    expect(reconciledCount).toBe(1);
    expect(orchestrator.executeDeletion).toHaveBeenCalledWith("dreq_stuck_1");
  });
});
