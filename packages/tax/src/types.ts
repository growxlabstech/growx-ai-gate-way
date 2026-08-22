import { Decimal } from "@growx/money";

// ─── Tax Identifier Types ─────────────────────────────────────

export type TaxIdentifierType = "GSTIN" | "VAT_ID" | "EIN" | "PAN" | "OTHER";

export type TaxIdentifierValidationStatus =
  "syntactically_valid" | "verified" | "unverified" | "invalid";

export interface TaxIdentifier {
  type: TaxIdentifierType;
  value: string;
  country: string;
  validationStatus: TaxIdentifierValidationStatus;
  verifiedAt?: Date | undefined;
}

export interface Address {
  addressLine1: string;
  addressLine2?: string | undefined;
  city?: string | undefined;
  stateRegion?: string | undefined;
  postalCode?: string | undefined;
  country: string;
}

// ─── Legal Entity (Seller) ───────────────────────────────────

export interface LegalEntity {
  id: string;
  code: string;
  legalName: string;
  country: string;
  stateRegion?: string | undefined;
  registeredAddress: Address;
  taxIdentifiers: TaxIdentifier[];
  invoicePrefix?: string | undefined;
  status: "active" | "inactive";
  createdAt: Date;
  updatedAt: Date;
}

export interface InvoiceLegalEntitySnapshot {
  id: string;
  legalEntityId: string;
  code: string;
  legalName: string;
  country: string;
  stateRegion?: string | undefined;
  registeredAddress: Address;
  taxIdentifiers: TaxIdentifier[];
  invoicePrefix?: string | undefined;
  snapshottedAt: Date;
}

// ─── Customer Billing Profile ─────────────────────────────────

export interface BillingProfile {
  id: string;
  organizationId: string;
  legalName: string;
  billingEmail?: string | undefined;
  country: string;
  stateRegion?: string | undefined;
  postalCode?: string | undefined;
  city?: string | undefined;
  addressLine1: string;
  addressLine2?: string | undefined;
  taxIdentifiers: TaxIdentifier[];
  billingCurrency?: string | undefined;
  taxExemptionStatus?: "none" | "exempt" | "pending_review" | undefined;
  createdAt: Date;
  updatedAt: Date;
}

export interface InvoiceBillingProfileSnapshot {
  id: string;
  organizationId: string;
  legalName: string;
  billingEmail?: string | undefined;
  country: string;
  stateRegion?: string | undefined;
  postalCode?: string | undefined;
  city?: string | undefined;
  addressLine1: string;
  addressLine2?: string | undefined;
  taxIdentifiers: TaxIdentifier[];
  taxExemptionStatus?: string | undefined;
  snapshottedAt: Date;
}

// ─── Tax Regimes & Classifications ───────────────────────────

export type TaxRegime =
  "INDIA_GST" | "EU_VAT" | "UK_VAT" | "US_SALES_TAX" | "OTHER";

export type TaxTreatment =
  "standard" | "zero_rated" | "exempt" | "reverse_charge" | "out_of_scope";

export type TaxType = "CGST" | "SGST" | "IGST" | "VAT" | "SALES_TAX" | "NONE";

export type SupplyType =
  "domestic" | "intra_state" | "inter_state" | "export" | "import";

export type CustomerType = "B2B" | "B2C";

// ─── Jurisdiction Decision ───────────────────────────────────

export interface TaxJurisdictionDecision {
  sellerCountry: string;
  sellerRegion?: string | undefined;
  customerCountry: string;
  customerRegion?: string | undefined;
  supplyClassification: SupplyType;
  taxRegime: TaxRegime;
  placeOfSupply?: string | undefined;
  reverseCharge: boolean;
  taxExempt: boolean;
  customerType: CustomerType;
  reasonCodes: string[];
}

// ─── Tax Line & Calculation ───────────────────────────────────

export interface TaxLine {
  taxType: TaxType;
  rate: Decimal;
  taxableAmount: Decimal;
  taxAmount: Decimal;
  jurisdiction: string;
  ruleId?: string | undefined;
  description: string;
  sacHsnCode?: string | undefined;
}

export interface TaxCalculation {
  jurisdictionDecision: TaxJurisdictionDecision;
  lines: TaxLine[];
  subtotal: Decimal;
  taxTotal: Decimal;
  total: Decimal;
  currency: string;
  taxVersion: number;
  calculatedAt: Date;
  taxTreatment: TaxTreatment;
}

// ─── Tax Rule ────────────────────────────────────────────────

export interface TaxRule {
  id: string;
  regime: TaxRegime;
  jurisdiction: string;
  supplyType?: SupplyType | undefined;
  customerType?: CustomerType | undefined;
  productTaxCode?: string | undefined; // e.g. SAC 998313
  taxType: TaxType;
  rate: Decimal; // e.g. 0.18 for 18%, 0.09 for 9%
  effectiveFrom: Date;
  effectiveTo?: Date | undefined;
  status: "active" | "draft" | "retired";
  version: number;
  description?: string | undefined;
}
