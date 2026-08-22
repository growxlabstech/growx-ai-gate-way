import { createHash } from "node:crypto";
import { Decimal } from "@growx/money";
import type {
  Address,
  BillingProfile,
  InvoiceBillingProfileSnapshot,
  InvoiceLegalEntitySnapshot,
  LegalEntity,
} from "@growx/tax";
import type {
  InvoiceLine,
  InvoiceLineSourceType,
  InvoiceType,
} from "./types.js";

export interface InvoiceDraftLineInput {
  description: string;
  quantity: number | bigint;
  unit?: string | undefined;
  unitPrice: Decimal;
  productCode?: string | undefined;
  taxCode?: string | undefined; // SAC / HSN
  servicePeriodStart?: Date | undefined;
  servicePeriodEnd?: Date | undefined;
  sourceType: InvoiceLineSourceType;
  sourceId: string;
}

export interface InvoiceDraftInput {
  organizationId: string;
  seller: LegalEntity | InvoiceLegalEntitySnapshot;
  customer: BillingProfile | InvoiceBillingProfileSnapshot;
  invoiceType?: InvoiceType | undefined;
  currency: string;
  issueDate?: Date | undefined;
  dueDate?: Date | undefined;
  servicePeriodStart?: Date | undefined;
  servicePeriodEnd?: Date | undefined;
  lines: InvoiceDraftLineInput[];
}

export interface InvoiceDraft {
  organizationId: string;
  legalEntityId: string;
  invoiceType: InvoiceType;
  currency: string;
  issueDate: Date;
  dueDate: Date;
  servicePeriodStart?: Date | undefined;
  servicePeriodEnd?: Date | undefined;
  sellerSnapshot: InvoiceLegalEntitySnapshot;
  customerSnapshot: InvoiceBillingProfileSnapshot;
  lines: Omit<InvoiceLine, "id" | "invoiceId">[];
  subtotal: Decimal;
  draftHash: string;
}

export class InvoiceDraftBuilder {
  /**
   * Builds an invoice draft with deterministic draft fingerprint (SHA-256).
   */
  static build(input: InvoiceDraftInput): InvoiceDraft {
    if (!input.lines || input.lines.length === 0) {
      throw new Error("Invoice draft must contain at least one line item");
    }

    const issueDate = input.issueDate ?? new Date();
    // Default due date: issueDate + 14 days
    const dueDate =
      input.dueDate ?? new Date(issueDate.getTime() + 14 * 24 * 60 * 60 * 1000);

    // Create snapshots if not already snapshots
    const sellerSnapshot: InvoiceLegalEntitySnapshot =
      "snapshottedAt" in input.seller
        ? input.seller
        : {
            id: `snap_le_${input.seller.id}`,
            legalEntityId: input.seller.id,
            code: input.seller.code,
            legalName: input.seller.legalName,
            country: input.seller.country,
            stateRegion: input.seller.stateRegion,
            registeredAddress: input.seller.registeredAddress,
            taxIdentifiers: input.seller.taxIdentifiers,
            invoicePrefix: input.seller.invoicePrefix,
            snapshottedAt: issueDate,
          };

    const customerSnapshot: InvoiceBillingProfileSnapshot =
      "snapshottedAt" in input.customer
        ? input.customer
        : {
            id: `snap_bp_${input.customer.id}`,
            organizationId: input.customer.organizationId,
            legalName: input.customer.legalName,
            billingEmail: input.customer.billingEmail,
            country: input.customer.country,
            stateRegion: input.customer.stateRegion,
            postalCode: input.customer.postalCode,
            city: input.customer.city,
            addressLine1: input.customer.addressLine1,
            addressLine2: input.customer.addressLine2,
            taxIdentifiers: input.customer.taxIdentifiers,
            taxExemptionStatus: input.customer.taxExemptionStatus,
            snapshottedAt: issueDate,
          };

    let subtotal = Decimal.ZERO;
    const processedLines: Omit<InvoiceLine, "id" | "invoiceId">[] = [];

    for (let i = 0; i < input.lines.length; i++) {
      const l = input.lines[i];
      if (!l) continue;
      const q =
        typeof l.quantity === "bigint" ? Number(l.quantity) : l.quantity;
      if (q <= 0) {
        throw new Error(
          `Line ${i + 1} has invalid non-positive quantity: ${q}`,
        );
      }
      if (l.unitPrice.isNegative()) {
        throw new Error(`Line ${i + 1} has negative unit price`);
      }

      const lineSubtotal = l.unitPrice.mul(q).round(2);
      subtotal = subtotal.add(lineSubtotal);

      processedLines.push({
        lineNumber: i + 1,
        description: l.description,
        quantity: q,
        unit: l.unit ?? "unit",
        unitPrice: l.unitPrice,
        subtotal: lineSubtotal,
        productCode: l.productCode,
        taxCode: l.taxCode,
        servicePeriodStart: l.servicePeriodStart,
        servicePeriodEnd: l.servicePeriodEnd,
        sourceType: l.sourceType,
        sourceId: l.sourceId,
      });
    }

    // Deterministic Draft Fingerprint Hash (SHA-256)
    const hashPayload = JSON.stringify({
      org: input.organizationId,
      legalEntity: sellerSnapshot.legalEntityId,
      currency: input.currency,
      subtotal: subtotal.toString(),
      lines: processedLines.map((pl) => ({
        n: pl.lineNumber,
        d: pl.description,
        q: pl.quantity.toString(),
        p: pl.unitPrice.toString(),
        s: pl.subtotal.toString(),
        t: pl.taxCode,
      })),
      sellerGstin: sellerSnapshot.taxIdentifiers.map((t) => t.value).sort(),
      customerGstin: customerSnapshot.taxIdentifiers.map((t) => t.value).sort(),
    });

    const draftHash = createHash("sha256").update(hashPayload).digest("hex");

    return {
      organizationId: input.organizationId,
      legalEntityId: sellerSnapshot.legalEntityId,
      invoiceType: input.invoiceType ?? "invoice",
      currency: input.currency,
      issueDate,
      dueDate,
      servicePeriodStart: input.servicePeriodStart,
      servicePeriodEnd: input.servicePeriodEnd,
      sellerSnapshot,
      customerSnapshot,
      lines: processedLines,
      subtotal,
      draftHash,
    };
  }
}
