import type { CriticalInvariantResult } from "@growx/contracts";

export interface PlatformStateSnapshot {
  walletBalances?: Array<{
    accountId: string;
    balance: string;
    ledgerSum: string;
  }>;
  apiKeys?: Array<{ id: string; secretHashPresent: boolean; orgId: string }>;
  providerCredentials?: Array<{
    accountId: string;
    activeVersionCount: number;
  }>;
  batches?: Array<{
    id: string;
    totalItems: number;
    processedItems: number;
    isTerminal: boolean;
  }>;
  deletedResources?: Array<{
    id: string;
    isDeleted: boolean;
    stillAccessible: boolean;
  }>;
}

export class CriticalInvariantVerifier {
  public verifyAll(snapshot: PlatformStateSnapshot): CriticalInvariantResult[] {
    return [
      this.verifyWalletLedgerInvariants(snapshot.walletBalances || []),
      this.verifyAuthApiKeyInvariants(snapshot.apiKeys || []),
      this.verifyCredentialVaultInvariants(snapshot.providerCredentials || []),
      this.verifyBatchStateInvariants(snapshot.batches || []),
      this.verifyGovernanceTombstoneInvariants(snapshot.deletedResources || []),
    ];
  }

  public verifyWalletLedgerInvariants(
    balances: Array<{ accountId: string; balance: string; ledgerSum: string }>,
  ): CriticalInvariantResult {
    let discrepancies = 0;
    for (const b of balances) {
      if (b.balance !== b.ledgerSum) {
        discrepancies++;
      }
    }
    return {
      checkName: "wallet_ledger_integrity",
      status: discrepancies === 0 ? "passed" : "failed",
      details:
        discrepancies === 0
          ? "All wallet account balances strictly equal summed ledger entries."
          : `Found ${discrepancies} wallet balance discrepancies against ledger.`,
      recordsEvaluated: balances.length,
      discrepanciesFound: discrepancies,
    };
  }

  public verifyAuthApiKeyInvariants(
    keys: Array<{ id: string; secretHashPresent: boolean; orgId: string }>,
  ): CriticalInvariantResult {
    let discrepancies = 0;
    for (const k of keys) {
      if (!k.secretHashPresent || !k.orgId) {
        discrepancies++;
      }
    }
    return {
      checkName: "auth_api_key_hash_integrity",
      status: discrepancies === 0 ? "passed" : "failed",
      details:
        discrepancies === 0
          ? "All API keys possess valid non-plaintext hashes and tenant org bindings."
          : `Found ${discrepancies} API keys with invalid hashes or missing tenant.`,
      recordsEvaluated: keys.length,
      discrepanciesFound: discrepancies,
    };
  }

  public verifyCredentialVaultInvariants(
    creds: Array<{ accountId: string; activeVersionCount: number }>,
  ): CriticalInvariantResult {
    let discrepancies = 0;
    for (const c of creds) {
      if (c.activeVersionCount > 1) {
        discrepancies++;
      }
    }
    return {
      checkName: "provider_credential_single_active_version",
      status: discrepancies === 0 ? "passed" : "failed",
      details:
        discrepancies === 0
          ? "Every provider account has at most one active credential version."
          : `Found ${discrepancies} provider accounts with multiple active credential versions.`,
      recordsEvaluated: creds.length,
      discrepanciesFound: discrepancies,
    };
  }

  public verifyBatchStateInvariants(
    batches: Array<{
      id: string;
      totalItems: number;
      processedItems: number;
      isTerminal: boolean;
    }>,
  ): CriticalInvariantResult {
    let discrepancies = 0;
    for (const b of batches) {
      if (b.isTerminal && b.processedItems !== b.totalItems) {
        discrepancies++;
      }
    }
    return {
      checkName: "batch_terminal_item_accounting",
      status: discrepancies === 0 ? "passed" : "failed",
      details:
        discrepancies === 0
          ? "All terminal batches have exactly accounted item counts."
          : `Found ${discrepancies} terminal batches with unaccounted item discrepancies.`,
      recordsEvaluated: batches.length,
      discrepanciesFound: discrepancies,
    };
  }

  public verifyGovernanceTombstoneInvariants(
    resources: Array<{
      id: string;
      isDeleted: boolean;
      stillAccessible: boolean;
    }>,
  ): CriticalInvariantResult {
    let discrepancies = 0;
    for (const r of resources) {
      if (r.isDeleted && r.stillAccessible) {
        discrepancies++;
      }
    }
    return {
      checkName: "governance_tombstone_no_resurrection",
      status: discrepancies === 0 ? "passed" : "failed",
      details:
        discrepancies === 0
          ? "Zero deleted customer resources became accessible post-restore."
          : `Found ${discrepancies} resurrected deleted resources post-restore.`,
      recordsEvaluated: resources.length,
      discrepanciesFound: discrepancies,
    };
  }
}
