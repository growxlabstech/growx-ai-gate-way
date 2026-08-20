import { describe, expect, it, beforeEach } from "vitest";
import { Decimal } from "@growx/money";
import { TaxService, InMemoryTaxRepository } from "@growx/tax-service";
import { InvoiceService } from "../src/application/invoice-service.js";
import { InMemoryInvoiceRepository } from "../src/infrastructure/in-memory-repository.js";

describe("Phase 20 — Tenant Isolation & Security", () => {
  let invoiceService: InvoiceService;
  let taxService: TaxService;
  let seller: any;

  beforeEach(async () => {
    const taxRepo = new InMemoryTaxRepository();
    taxService = new TaxService(taxRepo);
    const invoiceRepo = new InMemoryInvoiceRepository();
    invoiceService = new InvoiceService({
      repository: invoiceRepo,
      taxService,
    });

    seller = await taxService.createLegalEntity({
      code: "GXL_SEC",
      legalName: "GrowX Security Entity",
      country: "US",
      registeredAddress: { addressLine1: "Market St", city: "San Francisco", country: "US" },
      taxIdentifiers: [],
    });

    await taxService.createTaxRule({
      regime: "OTHER",
      jurisdiction: "US",
      taxType: "SALES_TAX",
      rate: "0.00",
      effectiveFrom: new Date("2020-01-01"),
    });
  });

  it("strictly prevents Org B from accessing or voiding Org A's invoices", async () => {
    const customerA = await taxService.upsertBillingProfile("org_a", {
      legalName: "Org A Legal",
      country: "US",
      addressLine1: "Org A Road",
    });

    const draftA = invoiceService.createDraft({
      organizationId: "org_a",
      seller,
      customer: customerA,
      currency: "USD",
      lines: [
        {
          description: "Org A Secret Tier",
          quantity: 1,
          unitPrice: Decimal.from("100.00"),
          sourceType: "subscription_fee",
          sourceId: "sub_a",
        },
      ],
    });

    const invoiceA = await invoiceService.issueInvoice({ draft: draftA });

    // Org B tries to view invoice A
    const attemptRead = await invoiceService.getInvoice("org_b", invoiceA.id);
    expect(attemptRead).toBeUndefined();

    // Org B tries to get document of invoice A
    const attemptDoc = await invoiceService.getInvoiceDocument("org_b", invoiceA.id);
    expect(attemptDoc).toBeUndefined();

    // Org B tries to void invoice A
    await expect(invoiceService.voidInvoice("org_b", invoiceA.id, "Malicious void")).rejects.toThrow(
      "Invoice not found"
    );
  });
});
