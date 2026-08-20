import { describe, expect, it } from "vitest";
import { Decimal } from "@growx/money";
import type { LegalEntity, BillingProfile } from "@growx/tax";
import {
  InvoiceDraftBuilder,
  InvoiceNumberService,
  InvoiceDocumentRenderer,
  InMemoryBillingDocumentStorage,
  getFiscalYear,
} from "./index.js";

describe("Phase 20 — @growx/billing Package", () => {
  const mockSeller: LegalEntity = {
    id: "le_seller_1",
    code: "GXL",
    legalName: "GrowX Labs Inc",
    country: "US",
    registeredAddress: {
      addressLine1: "100 Market St",
      city: "San Francisco",
      country: "US",
    },
    taxIdentifiers: [],
    invoicePrefix: "GXL-US",
    status: "active",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockCustomer: BillingProfile = {
    id: "bp_cust_1",
    organizationId: "org_cust_1",
    legalName: "Customer & Co <script>alert(1)</script>",
    country: "US",
    addressLine1: "200 Main St",
    taxIdentifiers: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it("formats fiscal year and invoice numbers accurately", () => {
    // April 2026 -> 2026-27 fiscal year in India
    const aprilDate = new Date("2026-04-15T12:00:00Z");
    expect(getFiscalYear(aprilDate, 4)).toBe("2026-27");

    // Feb 2026 -> 2025-26 fiscal year in India
    const febDate = new Date("2026-02-15T12:00:00Z");
    expect(getFiscalYear(febDate, 4)).toBe("2025-26");

    const invNum = InvoiceNumberService.formatInvoiceNumber({
      prefix: "GXL-IN",
      sequence: 42,
      date: aprilDate,
    });
    expect(invNum).toBe("GXL-IN/2026-27/000042");

    const cnNum = InvoiceNumberService.formatCreditNoteNumber({
      prefix: "GXL-IN",
      sequence: 7,
      date: aprilDate,
    });
    expect(cnNum).toBe("CN-GXL-IN/2026-27/000007");
  });

  it("builds an invoice draft with deterministic SHA-256 fingerprint", () => {
    const draft1 = InvoiceDraftBuilder.build({
      organizationId: "org_cust_1",
      seller: mockSeller,
      customer: mockCustomer,
      currency: "USD",
      lines: [
        {
          description: "Monthly Platform Fee",
          quantity: 1,
          unitPrice: Decimal.from("99.00"),
          sourceType: "subscription_fee",
          sourceId: "sub_1",
          taxCode: "998313",
        },
      ],
    });

    expect(draft1.subtotal.toString()).toBe("99");
    expect(draft1.draftHash).toBeDefined();
    expect(draft1.draftHash.length).toBe(64); // SHA-256 hex length

    // Identical parameters produce identical draft hash
    const draft2 = InvoiceDraftBuilder.build({
      organizationId: "org_cust_1",
      seller: mockSeller,
      customer: mockCustomer,
      currency: "USD",
      lines: [
        {
          description: "Monthly Platform Fee",
          quantity: 1,
          unitPrice: Decimal.from("99.00"),
          sourceType: "subscription_fee",
          sourceId: "sub_1",
          taxCode: "998313",
        },
      ],
    });

    expect(draft1.draftHash).toBe(draft2.draftHash);
  });

  it("escapes user input and prevents XSS in HTML document renderer", () => {
    const draft = InvoiceDraftBuilder.build({
      organizationId: "org_cust_1",
      seller: mockSeller,
      customer: mockCustomer,
      currency: "USD",
      lines: [
        {
          description: "Test <b>injection</b>",
          quantity: 1,
          unitPrice: Decimal.from("10.00"),
          sourceType: "subscription_fee",
          sourceId: "sub_1",
        },
      ],
    });

    const invoice: any = {
      ...draft,
      id: "inv_123",
      invoiceNumber: "GXL/2026/000001",
      status: "issued",
      taxTotal: Decimal.ZERO,
      total: Decimal.from("10.00"),
      amountPaid: Decimal.ZERO,
      amountDue: Decimal.from("10.00"),
      billingProfileSnapshot: draft.customerSnapshot,
      legalEntitySnapshot: draft.sellerSnapshot,
      taxCalculationVersion: 1,
      taxLines: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const { html, sha256Hash } = InvoiceDocumentRenderer.renderHtml(invoice);
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("Test &lt;b&gt;injection&lt;/b&gt;");
    expect(sha256Hash).toBeDefined();
    expect(sha256Hash.length).toBe(64);
  });

  it("stores and retrieves rendered documents via BillingDocumentStorage", async () => {
    const storage = new InMemoryBillingDocumentStorage();
    const key = "invoices/2026/inv_123.html";
    const content = "<html><body>Test Invoice</body></html>";

    const { storageKey, byteSize } = await storage.put(key, content);
    expect(storageKey).toBe(key);
    expect(byteSize).toBe(content.length);

    const doc = await storage.get(key);
    expect(doc).toBeDefined();
    expect(doc!.content.toString("utf8")).toBe(content);

    const signedUrl = await storage.getSignedUrl(key);
    expect(signedUrl).toContain("https://storage.growx.internal/documents/");
  });
});
