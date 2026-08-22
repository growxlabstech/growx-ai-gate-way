import { describe, it, expect } from "vitest";
import { CriticalInvariantVerifier } from "../src/invariant-verifier.js";

describe("CriticalInvariantVerifier", () => {
  const verifier = new CriticalInvariantVerifier();

  it("passes when all state snapshots strictly satisfy invariants", () => {
    const results = verifier.verifyAll({
      walletBalances: [
        { accountId: "w_1", balance: "100.00", ledgerSum: "100.00" },
        { accountId: "w_2", balance: "50.00", ledgerSum: "50.00" },
      ],
      apiKeys: [{ id: "key_1", secretHashPresent: true, orgId: "org_1" }],
      providerCredentials: [{ accountId: "acc_1", activeVersionCount: 1 }],
      batches: [
        { id: "bat_1", totalItems: 10, processedItems: 10, isTerminal: true },
      ],
      deletedResources: [
        { id: "res_del_1", isDeleted: true, stillAccessible: false },
      ],
    });

    expect(results.length).toBe(5);
    for (const r of results) {
      expect(r.status).toBe("passed");
      expect(r.discrepanciesFound).toBe(0);
    }
  });

  it("detects wallet balance discrepancy against ledger", () => {
    const res = verifier.verifyWalletLedgerInvariants([
      { accountId: "w_bad", balance: "100.00", ledgerSum: "80.00" },
    ]);
    expect(res.status).toBe("failed");
    expect(res.discrepanciesFound).toBe(1);
  });

  it("detects resurrected deleted resource post-restore", () => {
    const res = verifier.verifyGovernanceTombstoneInvariants([
      { id: "res_zombie", isDeleted: true, stillAccessible: true },
    ]);
    expect(res.status).toBe("failed");
    expect(res.discrepanciesFound).toBe(1);
  });
});
