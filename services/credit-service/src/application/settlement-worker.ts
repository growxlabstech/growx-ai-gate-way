import type { SettlementResult } from "../domain/types.js";
import type { CreditService } from "./credit-service.js";

export interface SettlementMessage {
  reservationId: string;
  finalCustomerPrice: string;
  requestId: string;
  actualInputTokens?: number | undefined;
  actualOutputTokens?: number | undefined;
  idempotencyKey?: string | undefined;
}

export class SettlementWorker {
  constructor(private readonly creditService: CreditService) {}

  /**
   * Processes a settlement event/message asynchronously.
   */
  async processSettlement(msg: SettlementMessage): Promise<SettlementResult> {
    return this.creditService.settleReservation({
      reservationId: msg.reservationId,
      finalCustomerPrice: msg.finalCustomerPrice,
      actualInputTokens: msg.actualInputTokens,
      actualOutputTokens: msg.actualOutputTokens,
      idempotencyKey: msg.idempotencyKey ?? `settle_${msg.reservationId}`,
    });
  }
}
