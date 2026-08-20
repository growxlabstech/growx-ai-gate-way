import { describe, expect, it, beforeEach } from "vitest";
import { Decimal } from "@growx/money";
import { TaxService, InMemoryTaxRepository } from "@growx/tax-service";
import { InvoiceService } from "../src/application/invoice-service.js";
import { InvoiceReconciliationWorker } from "../src/workers/invoice-reconciliation-worker.js";
import { InMemoryInvoiceRepository } from "../src/infrastructure/in-memory-repository.js";

describe("Phase 20 — Payment Allocation & Reconciliation", () => {
  let invoiceService: InvoiceService;
  let taxService: TaxService;
  let invoiceRepo: InMemoryInvoiceRepository;
  let reconciliationWorker: InvoiceReconciliationWorker;
  let seller: any;
  let customer: any;

  beforeEach(async () => {
    const taxRepo = new InMemoryTaxRepository();
    taxService = new TaxService(taxRepo);
    invoiceRepo = new InMemoryInvoiceRepository();
    invoiceService = new InvoiceService({
      repository: invoiceRepo,
      taxService,
    });
    reconciliationWorker = new InvoiceReconciliationWorker({
      invoiceService,
      repository: invoiceRepo,
    });

    seller = await taxService.createLegalEntity({
      code: "GXL_PAY",
      legalName: "GrowX Pay Entity",
      country: "US",
      registeredAddress: {
        addressLine1: "Market St",
        city: "San Francisco",
        country: "US",
      },
      taxIdentifiers: [],
      invoicePrefix: "GXL-US",
    });

    await taxService.createTaxRule({
      regime: "OTHER",
      jurisdiction: "US",
      supplyType: "domestic",
      taxType: "SALES_TAX",
      rate: "0.00",
      effectiveFrom: new Date("2020-01-01"),
    });

    customer = await taxService.upsertBillingProfile("org_pay_test", {
      legalName: "Pay Customer",
      country: "US",
      addressLine1: "Main St",
    });
  });

  it("handles partial payment followed by full payment completion", async () => {
    const draft = invoiceService.createDraft({
      organizationId: "org_pay_test",
      seller,
      customer,
      currency: "USD",
      lines: [
        {
          description: "Annual Subscription",
          quantity: 1,
          unitPrice: Decimal.from("100.00"),
          sourceType: "subscription_fee",
          sourceId: "sub_ann_1",
        },
      ],
    });

    const invoice = await invoiceService.issueInvoice({ draft });
    expect(invoice.total.toString()).toBe("100");
    expect(invoice.amountDue.toString()).toBe("100");

    // Partial payment: $40
    const partResult = await invoiceService.allocatePayment({
      organizationId: "org_pay_test",
      invoiceId: invoice.id,
      paymentId: "pay_part_1",
      amount: Decimal.from("40.00"),
      currency: "USD",
      idempotencyKey: "alloc_part_1",
    });

    expect(partResult.invoice.status).toBe("partially_paid");
    expect(partResult.invoice.amountPaid.toString()).toBe("40");
    expect(partResult.invoice.amountDue.toString()).toBe("60");

    // Full remaining payment: $60
    const fullResult = await invoiceService.allocatePayment({
      organizationId: "org_pay_test",
      invoiceId: invoice.id,
      paymentId: "pay_full_1",
      amount: Decimal.from("60.00"),
      currency: "USD",
      idempotencyKey: "alloc_full_1",
    });

    expect(fullResult.invoice.status).toBe("paid");
    expect(fullResult.invoice.amountPaid.toString()).toBe("100");
    expect(fullResult.invoice.amountDue.toString()).toBe("0");
  });

  it("safely ignores duplicate payment allocation webhooks (idempotency)", async () => {
    const draft = invoiceService.createDraft({
      organizationId: "org_pay_test",
      seller,
      customer,
      currency: "USD",
      lines: [
        {
          description: "Monthly Service",
          quantity: 1,
          unitPrice: Decimal.from("50.00"),
          sourceType: "subscription_fee",
          sourceId: "sub_m_1",
        },
      ],
    });

    const invoice = await invoiceService.issueInvoice({ draft });

    // First call
    const res1 = await invoiceService.allocatePayment({
      organizationId: "org_pay_test",
      invoiceId: invoice.id,
      paymentId: "pay_dup_1",
      amount: Decimal.from("50.00"),
      currency: "USD",
      idempotencyKey: "key_dup_123",
    });
    expect(res1.invoice.status).toBe("paid");

    // Duplicate call with same idempotency key
    const res2 = await invoiceService.allocatePayment({
      organizationId: "org_pay_test",
      invoiceId: invoice.id,
      paymentId: "pay_dup_1",
      amount: Decimal.from("50.00"),
      currency: "USD",
      idempotencyKey: "key_dup_123",
    });

    expect(res2.invoice.amountPaid.toString()).toBe("50"); // Not 100
  });

  it("reconciles batch of payments via InvoiceReconciliationWorker", async () => {
    const draft = invoiceService.createDraft({
      organizationId: "org_pay_test",
      seller,
      customer,
      currency: "USD",
      lines: [
        {
          description: "Usage Batch",
          quantity: 1,
          unitPrice: Decimal.from("80.00"),
          sourceType: "usage_charge",
          sourceId: "usage_b_1",
        },
      ],
    });

    const invoice = await invoiceService.issueInvoice({ draft });

    const result = await reconciliationWorker.runOnce([
      {
        organizationId: "org_pay_test",
        invoiceId: invoice.id,
        paymentId: "pay_recon_1",
        amount: Decimal.from("80.00"),
        currency: "USD",
      },
    ]);

    expect(result.reconciled).toBe(1);
    expect(result.failed).toBe(0);

    const updated = await invoiceService.getInvoice("org_pay_test", invoice.id);
    expect(updated!.status).toBe("paid");
  });
});
