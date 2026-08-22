import { describe, it, expect } from "vitest";
import { RestoreDrillRunner } from "../src/restore-drill-runner.js";

describe("RestoreDrillRunner", () => {
  const runner = new RestoreDrillRunner();

  it("executes isolated restore drill and records verified RecoveryRun", async () => {
    const run = await runner.executeDrill({
      type: "db_restore_drill",
      scope: "postgres_primary_snapshot",
      operatorId: "usr_ops_lead",
      simulatedDurationMs: 1500,
      simulatedRpoSeconds: 30,
      stateSnapshot: {
        walletBalances: [
          { accountId: "w_drill", balance: "10.00", ledgerSum: "10.00" },
        ],
        apiKeys: [
          { id: "key_drill", secretHashPresent: true, orgId: "org_drill" },
        ],
        providerCredentials: [
          { accountId: "acc_drill", activeVersionCount: 1 },
        ],
        batches: [],
        deletedResources: [],
      },
    });

    expect(run.status).toBe("passed");
    expect(run.observedRpoSeconds).toBe(30);
    expect(run.observedRtoSeconds).toBe(1.5);
    expect(run.invariants.every((i) => i.status === "passed")).toBe(true);

    const retrieved = runner.getRun(run.id);
    expect(retrieved?.id).toBe(run.id);
  });
});
