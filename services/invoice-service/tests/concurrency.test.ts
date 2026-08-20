import { describe, expect, it, beforeEach } from "vitest";
import { Decimal } from "@growx/money";
import { TaxService, InMemoryTaxRepository } from "@growx/tax-service";
import { InvoiceService } from "../src/application/invoice-service.js";
import { InMemoryInvoiceRepository } from "../src/infrastructure/in-memory-repository.js";

describe("Phase 20 — Concurrency & Numbering Sequences", () => {
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
      code: "GXL_SEQ",
      legalName: "GrowX Sequence Entity",
      country: "IN",
      stateRegion: "KA",
      registeredAddress: {
        addressLine1: "100 MG Road",
        city: "Bengaluru",
        country: "IN",
      },
      taxIdentifiers: [],
      invoicePrefix: "GXL",
    });

    await taxService.createTaxRule({
      regime: "INDIA_GST",
      jurisdiction: "IN",
      supplyType: "intra_state",
      taxType: "CGST",
      rate: "0.09",
      effectiveFrom: new Date("2020-01-01"),
    });
    await taxService.createTaxRule({
      regime: "INDIA_GST",
      jurisdiction: "KA",
      supplyType: "intra_state",
      taxType: "SGST",
      rate: "0.09",
      effectiveFrom: new Date("2020-01-01"),
    });

    customer = await taxService.upsertBillingProfile("org_concur", {
      legalName: "Concurrent Org",
      country: "IN",
      stateRegion: "KA",
      addressLine1: "100 Indiranagar",
    });
  });

  it("handles 100 concurrent invoice issuances generating 100 strictly unique invoice numbers", async () => {
    const issuePromises = [];
    for (let i = 1; i <= 100; i++) {
      const draft = invoiceService.createDraft({
        organizationId: "org_concur",
        seller,
        customer,
        currency: "INR",
        lines: [
          {
            description: `Batch Item ${i}`,
            quantity: 1,
            unitPrice: Decimal.from("10.00"),
            sourceType: "usage_charge",
            sourceId: `usage_${i}`,
          },
        ],
      });

      issuePromises.push(invoiceService.issueInvoice({ draft }));
    }

    const issuedInvoices = await Promise.all(issuePromises);
    expect(issuedInvoices.length).toBe(100);

    const invoiceNumbers = issuedInvoices.map((inv) => inv.invoiceNumber);
    const uniqueNumbers = new Set(invoiceNumbers);

    expect(uniqueNumbers.size).toBe(100); // 0 collisions!
  });
});
