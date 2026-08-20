import { Decimal } from "@growx/money";
import type { InvoiceService } from "../application/invoice-service.js";
import type { IInvoiceRepository } from "../domain/types.js";

export interface InvoiceReconciliationWorkerOptions {
  invoiceService: InvoiceService;
  repository: IInvoiceRepository;
}

export class InvoiceReconciliationWorker {
  private readonly invoiceService: InvoiceService;
  private readonly repository: IInvoiceRepository;

  constructor(options: InvoiceReconciliationWorkerOptions) {
    this.invoiceService = options.invoiceService;
    this.repository = options.repository;
  }

  /**
   * Runs a single reconciliation sweep.
   * Finds unallocated or partially paid invoices with matching payment records.
   */
  async runOnce(unallocatedPayments: {
    organizationId: string;
    invoiceId: string;
    paymentId: string;
    amount: Decimal;
    currency: string;
  }[]): Promise<{ reconciled: number; failed: number }> {
    let reconciled = 0;
    let failed = 0;

    for (const p of unallocatedPayments) {
      try {
        await this.invoiceService.allocatePayment({
          organizationId: p.organizationId,
          invoiceId: p.invoiceId,
          paymentId: p.paymentId,
          amount: p.amount,
          currency: p.currency,
          idempotencyKey: `recon_${p.paymentId}_${p.invoiceId}`,
        });
        reconciled++;
      } catch {
        failed++;
      }
    }

    return { reconciled, failed };
  }
}
