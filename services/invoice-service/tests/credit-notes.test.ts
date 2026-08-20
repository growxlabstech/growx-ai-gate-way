import { describe, expect, it, beforeEach } from "vitest";
import { Decimal } from "@growx/money";
import { TaxService, InMemoryTaxRepository } from "@growx/tax-service";
import { InvoiceService } from "../src/application/invoice-service.js";
import { InMemoryInvoiceRepository } from "../src/infrastructure/in-memory-repository.js";

describe("Phase 20 — Credit Notes", () => {
  let invoiceService: InvoiceService;
  let taxService: TaxService;
  let seller: any;
  let customer: any;

  beforeEach(async () => {
    const taxRepo = new InMemoryTaxRepository();
    taxService = new TaxService(taxRepo);
    const invoiceRepo = new InMemoryInvoiceRepository();
    invoiceService = new InvoiceService({
      repository: invoiceRepo,
      taxService,
    });

    seller = await taxService.createLegalEntity({
      code: "GXL_CN",
      legalName: "GrowX CN Entity",
      country: "US",
      registeredAddress: {
        addressLine1: "Market St",
        city: "San Francisco",
        country: "US",
      },
      taxIdentifiers: [],
      invoicePrefix: "GXL",
    });

    await taxService.createTaxRule({
      regime: "OTHER",
      jurisdiction: "US",
      supplyType: "domestic",
      taxType: "SALES_TAX",
      rate: "0.00",
      effectiveFrom: new Date("2020-01-01"),
    });

    customer = await taxService.upsertBillingProfile("org_cn_test", {
      legalName: "CN Customer",
      country: "US",
      addressLine1: "Main St",
    });
  });

  it("issues a credit note against an invoice and adjusts amountDue", async () => {
    const draft = invoiceService.createDraft({
      organizationId: "org_cn_test",
      seller,
      customer,
      currency: "USD",
      lines: [
        {
          description: "Overcharged Service",
          quantity: 1,
          unitPrice: Decimal.from("150.00"),
          sourceType: "subscription_fee",
          sourceId: "sub_over_1",
        },
      ],
    });

    const invoice = await invoiceService.issueInvoice({ draft });
    expect(invoice.amountDue.toString()).toBe("150");

    // Issue $50 partial credit note
    const { creditNote, invoice: updatedInvoice } = await invoiceService.issueCreditNote({
      organizationId: "org_cn_test",
      originalInvoiceId: invoice.id,
      reason: "Discount adjustment",
      amount: Decimal.from("50.00"),
    });

    expect(creditNote.creditNoteNumber).toMatch(/^CN-GXL\/\d{4}-\d{2}\/000002$/);
    expect(creditNote.total.toString()).toBe("50");
    expect(updatedInvoice.amountDue.toString()).toBe("100");

    // Retrieve credit note
    const fetchedCn = await invoiceService.getCreditNote("org_cn_test", creditNote.id);
    expect(fetchedCn).toBeDefined();
    expect(fetchedCn!.reason).toBe("Discount adjustment");
  });
});
