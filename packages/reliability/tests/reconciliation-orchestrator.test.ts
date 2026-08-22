import { describe, it, expect } from "vitest";
import { PlatformReconciliationOrchestrator } from "../src/reconciliation-orchestrator.js";

describe("PlatformReconciliationOrchestrator", () => {
  const orchestrator = new PlatformReconciliationOrchestrator();

  it("runs cross-domain reconciliation handlers and aggregates results", async () => {
    const report = await orchestrator.reconcileAll([
      {
        name: "wallet",
        reconcile: async () => ({ evaluated: 25, reconciled: 2 }),
      },
      {
        name: "batches",
        reconcile: async () => ({ evaluated: 5, reconciled: 1 }),
      },
      {
        name: "provider_ops",
        reconcile: async () => ({ evaluated: 10, reconciled: 0 }),
      },
    ]);

    expect(report.overallStatus).toBe("COMPLETED");
    expect(report.domainResults.length).toBe(3);
    expect(report.domainResults[0]!.domain).toBe("wallet");
    expect(report.domainResults[0]!.itemsReconciled).toBe(2);
  });
});
