import { Decimal } from "@growx/money";
import type {
  InvoiceBillingProfileSnapshot,
  InvoiceLegalEntitySnapshot,
  TaxLine,
} from "@growx/tax";

export type InvoiceStatus =
  | "draft"
  | "issued"
  | "partially_paid"
  | "paid"
  | "void"
  | "uncollectible";

export type InvoiceType =
  | "invoice"
  | "tax_invoice"
  | "proforma"
  | "credit_note";

export type InvoiceLineSourceType =
  | "subscription_fee"
  | "usage_charge"
  | "credit_purchase"
  | "manual_adjustment";

export interface InvoiceLine {
  id: string;
  invoiceId: string;
  lineNumber: number;
  description: string;
  quantity: number | bigint;
  unit: string;
  unitPrice: Decimal;
  subtotal: Decimal;
  productCode?: string | undefined;
  taxCode?: string | undefined; // SAC / HSN
  servicePeriodStart?: Date | undefined;
  servicePeriodEnd?: Date | undefined;
  sourceType: InvoiceLineSourceType;
  sourceId: string;
}

export interface InvoiceTaxLine {
  id: string;
  invoiceId: string;
  lineNumber: number;
  taxType: string; // CGST, SGST, IGST, VAT, etc.
  rate: Decimal;
  taxableAmount: Decimal;
  taxAmount: Decimal;
  jurisdiction: string;
  ruleId?: string | undefined;
  description: string;
  sacHsnCode?: string | undefined;
}

export interface Invoice {
  id: string;
  organizationId: string;
  legalEntityId: string;
  invoiceNumber: string;
  invoiceType: InvoiceType;
  status: InvoiceStatus;
  currency: string;
  issueDate: Date;
  dueDate: Date;
  servicePeriodStart?: Date | undefined;
  servicePeriodEnd?: Date | undefined;
  subtotal: Decimal;
  taxTotal: Decimal;
  total: Decimal;
  amountPaid: Decimal;
  amountDue: Decimal;
  billingProfileSnapshot: InvoiceBillingProfileSnapshot;
  legalEntitySnapshot: InvoiceLegalEntitySnapshot;
  taxCalculationVersion: number;
  lines: InvoiceLine[];
  taxLines: InvoiceTaxLine[];
  draftHash: string;
  issuedAt?: Date | undefined;
  voidedAt?: Date | undefined;
  createdAt: Date;
  updatedAt: Date;
}

export interface InvoicePaymentAllocation {
  id: string;
  invoiceId: string;
  paymentId: string;
  amount: Decimal;
  currency: string;
  allocatedAt: Date;
  idempotencyKey: string;
}

export type CreditNoteStatus = "issued" | "applied" | "void";

export interface CreditNoteLine {
  id: string;
  creditNoteId: string;
  lineNumber: number;
  description: string;
  quantity: number | bigint;
  unitPrice: Decimal;
  subtotal: Decimal;
  taxAmount: Decimal;
  total: Decimal;
}

export interface CreditNote {
  id: string;
  organizationId: string;
  legalEntityId: string;
  creditNoteNumber: string;
  originalInvoiceId: string;
  status: CreditNoteStatus;
  currency: string;
  subtotal: Decimal;
  taxTotal: Decimal;
  total: Decimal;
  amountAllocated: Decimal;
  reason: string;
  lines: CreditNoteLine[];
  issuedAt: Date;
  createdAt: Date;
}

export interface InvoiceDocument {
  id: string;
  invoiceId: string;
  version: number;
  templateVersion: string;
  format: "html" | "pdf";
  storageKey: string;
  sha256Hash: string;
  byteSize: number;
  status: "generated" | "failed";
  createdAt: Date;
}
