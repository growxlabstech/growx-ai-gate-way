import type { PaymentService } from "../application/payment-service.js";
import type { IPaymentRepository } from "../domain/types.js";

export interface ReconciliationWorkerOptions {
  paymentService: PaymentService;
  repository: IPaymentRepository;
  staleThresholdMs?: number;
  batchSize?: number;
}

export class PaymentReconciliationWorker {
  private readonly paymentService: PaymentService;
  private readonly repository: IPaymentRepository;
  private readonly staleThresholdMs: number;
  private readonly batchSize: number;

  constructor(options: ReconciliationWorkerOptions) {
    this.paymentService = options.paymentService;
    this.repository = options.repository;
    this.staleThresholdMs = options.staleThresholdMs ?? 15 * 60 * 1000; // 15 minutes
    this.batchSize = options.batchSize ?? 50;
  }

  async runOnce(): Promise<{
    processed: number;
    corrected: number;
    errors: number;
  }> {
    const cutoff = new Date(Date.now() - this.staleThresholdMs);
    const pendingPayments =
      await this.repository.listPendingPaymentsForReconciliation(
        cutoff,
        this.batchSize,
      );

    let processed = 0;
    let corrected = 0;
    let errors = 0;

    for (const payment of pendingPayments) {
      try {
        const initialStatus = payment.status;
        const result = await this.paymentService.reconcilePayment(payment.id);
        processed++;
        if (result.status !== initialStatus) {
          corrected++;
        }
      } catch {
        errors++;
      }
    }

    return { processed, corrected, errors };
  }
}
