import type { ICreditRepository } from "../domain/types.js";
import type { CreditService } from "./credit-service.js";

export interface WalletReconciliationReport {
  walletId: string;
  reconciled: boolean;
  discrepancies: string[];
}

export class ReconciliationWorker {
  constructor(
    private readonly repository: ICreditRepository,
    private readonly creditService: CreditService
  ) {}

  /**
   * Reconciles a single wallet by comparing materialized balance with ledger projection.
   */
  async reconcileWallet(walletId: string): Promise<WalletReconciliationReport> {
    const result = await this.creditService.rebuildBalance(walletId);
    return {
      walletId,
      reconciled: result.discrepancies.length === 0,
      discrepancies: result.discrepancies,
    };
  }
}
