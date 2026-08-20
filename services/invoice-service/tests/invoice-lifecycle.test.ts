import { describe, expect, it, beforeEach } from "vitest";
import { Decimal } from "@growx/money";
import { TaxService, InMemoryTaxRepository } from "@growx/tax-service";
import { InvoiceService } from "../src/application/invoice-service.js";
import { InMemoryInvoiceRepository } from "../src/infrastructure/in-memory-repository.js";

describe("Phase 20 — Invoice Lifecycle & Immutability", () => {
  let invoiceService: InvoiceService;
  let taxService: TaxService;
  let invoiceRepo: InMemoryInvoiceRepository;
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

    // Seed seller
    seller = await taxService.createLegalEntity({
      code: "GXL_IN",
      legalName: "GrowX Labs India Private Limited",
      country: "IN",
      stateRegion: "KA",
      registeredAddress: {
        addressLine1: "100 MG Road",
        city: "Bengaluru",
        country: "IN",
      },
      taxIdentifiers: [{ type: "GSTIN", value: "29AABCG1234F1Z5" }],
      invoicePrefix: "GXL-IN",
    });

    // Seed tax rules for 18% GST (intra-state CGST 9% + SGST 9%)
    await taxService.createTaxRule({
      regime: "INDIA_GST",
      jurisdiction: "IN",
      supplyType: "intra_state",
      taxType: "CGST",
      rate: "0.09",
      effectiveFrom: new Date("2020-01-01"),
      productTaxCode: "998313",
    });
    await taxService.createTaxRule({
      regime: "INDIA_GST",
      jurisdiction: "KA",
      supplyType: "intra_state",
      taxType: "SGST",
      rate: "0.09",
      effectiveFrom: new Date("2020-01-01"),
      productTaxCode: "998313",
    });

    // Seed customer
    customer = await taxService.upsertBillingProfile("org_test_life", {
      legalName: "Bengaluru Tech Corp",
      country: "IN",
      stateRegion: "KA",
      addressLine1: "Indiranagar",
      taxIdentifiers: [{ type: "GSTIN", value: "29XYZAB1234C1Z1" }],
    });
  });

  it("previews draft and issues legally valid invoice with tax lines", async () => {
    const draftInput = {
      organizationId: "org_test_life",
      seller,
      customer,
      currency: "INR",
      lines: [
        {
          description: "GrowX AI Pro Monthly",
          quantity: 1,
          unitPrice: Decimal.from("1000.00"),
          sourceType: "subscription_fee" as const,
          sourceId: "sub_period_1",
          taxCode: "998313",
        },
      ],
    };

    const preview = await invoiceService.previewDraft(draftInput);
    expect(preview.taxCalculation.subtotal.toString()).toBe("1000");
    expect(preview.taxCalculation.taxTotal.toString()).toBe("180");
    expect(preview.taxCalculation.total.toString()).toBe("1180");

    const invoice = await invoiceService.issueInvoice({ draft: preview.draft });
    expect(invoice.status).toBe("issued");
    expect(invoice.invoiceNumber).toMatch(/^GXL-IN\/\d{4}-\d{2}\/000001$/);
    expect(invoice.total.toString()).toBe("1180");
    expect(invoice.amountDue.toString()).toBe("1180");
    expect(invoice.amountPaid.toString()).toBe("0");
    expect(invoice.taxLines.length).toBe(2);
  });

  it("preserves immutable customer snapshot even after customer updates profile", async () => {
    const draft = invoiceService.createDraft({
      organizationId: "org_test_life",
      seller,
      customer,
      currency: "INR",
      lines: [
        {
          description: "Enterprise Subscription",
          quantity: 1,
          unitPrice: Decimal.from("5000.00"),
          sourceType: "subscription_fee" as const,
          sourceId: "sub_period_2",
          taxCode: "998313",
        },
      ],
    });

    const invoice = await invoiceService.issueInvoice({ draft });
    expect(invoice.billingProfileSnapshot.legalName).toBe("Bengaluru Tech Corp");

    // Customer changes legal name and address in billing profile
    await taxService.upsertBillingProfile("org_test_life", {
      legalName: "New Brand Global Ltd",
      country: "IN",
      addressLine1: "New Address",
    });

    // Issued invoice snapshot remains untouched!
    const reFetched = await invoiceService.getInvoice("org_test_life", invoice.id);
    expect(reFetched!.billingProfileSnapshot.legalName).toBe("Bengaluru Tech Corp");
  });

  it("voids an issued unpaid invoice", async () => {
    const draft = invoiceService.createDraft({
      organizationId: "org_test_life",
      seller,
      customer,
      currency: "INR",
      lines: [
        {
          description: "Mistake Order",
          quantity: 1,
          unitPrice: Decimal.from("500.00"),
          sourceType: "manual_adjustment" as const,
          sourceId: "adj_1",
          taxCode: "998313",
        },
      ],
    });

    const invoice = await invoiceService.issueInvoice({ draft });
    expect(invoice.status).toBe("issued");

    const voided = await invoiceService.voidInvoice("org_test_life", invoice.id, "Customer cancelled contract");
    expect(voided.status).toBe("void");
    expect(voided.voidedAt).toBeDefined();
  });
});
