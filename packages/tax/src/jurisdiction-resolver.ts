import type {
  Address,
  BillingProfile,
  CustomerType,
  InvoiceBillingProfileSnapshot,
  InvoiceLegalEntitySnapshot,
  LegalEntity,
  SupplyType,
  TaxJurisdictionDecision,
  TaxRegime,
} from "./types.js";

export interface ResolveJurisdictionParams {
  seller: LegalEntity | InvoiceLegalEntitySnapshot;
  customer: BillingProfile | InvoiceBillingProfileSnapshot;
  placeOfSupply?: string | undefined;
  productTaxCode?: string | undefined;
}

const EU_COUNTRIES = new Set([
  "AT",
  "BE",
  "BG",
  "HR",
  "CY",
  "CZ",
  "DK",
  "EE",
  "FI",
  "FR",
  "DE",
  "GR",
  "HU",
  "IE",
  "IT",
  "LV",
  "LT",
  "LU",
  "MT",
  "NL",
  "PL",
  "PT",
  "RO",
  "SK",
  "SI",
  "ES",
  "SE",
]);

export class TaxJurisdictionResolver {
  /**
   * Deterministically resolves tax regime, supply classification, reverse charge,
   * and place of supply without guessing from IP addresses.
   */
  static resolve(params: ResolveJurisdictionParams): TaxJurisdictionDecision {
    const sellerCountry = params.seller.country.toUpperCase();
    const customerCountry = params.customer.country.toUpperCase();
    const sellerRegion = params.seller.stateRegion?.trim().toUpperCase();
    const customerRegion = params.customer.stateRegion?.trim().toUpperCase();
    const placeOfSupply = (
      params.placeOfSupply ??
      customerRegion ??
      customerCountry
    )
      .trim()
      .toUpperCase();

    // Determine B2B vs B2C
    const hasValidTaxId = params.customer.taxIdentifiers.some(
      (t) =>
        t.validationStatus === "syntactically_valid" ||
        t.validationStatus === "verified",
    );
    const customerType: CustomerType = hasValidTaxId ? "B2B" : "B2C";
    const taxExempt = params.customer.taxExemptionStatus === "exempt";
    const reasonCodes: string[] = [];

    // ─── India GST ─────────────────────────────────────────────
    if (sellerCountry === "IN") {
      if (customerCountry === "IN") {
        const isIntraState =
          Boolean(sellerRegion) &&
          Boolean(placeOfSupply) &&
          sellerRegion === placeOfSupply;

        const supplyClassification: SupplyType = isIntraState
          ? "intra_state"
          : "inter_state";

        reasonCodes.push(
          isIntraState ? "INDIA_INTRA_STATE_GST" : "INDIA_INTER_STATE_IGST",
          customerType === "B2B"
            ? "INDIA_B2B_REGISTERED"
            : "INDIA_B2C_UNREGISTERED",
        );

        return {
          sellerCountry,
          sellerRegion,
          customerCountry,
          customerRegion,
          supplyClassification,
          taxRegime: "INDIA_GST",
          placeOfSupply,
          reverseCharge: false,
          taxExempt,
          customerType,
          reasonCodes,
        };
      } else {
        // Export from India
        reasonCodes.push("INDIA_EXPORT_OF_SERVICES");
        return {
          sellerCountry,
          sellerRegion,
          customerCountry,
          customerRegion,
          supplyClassification: "export",
          taxRegime: "INDIA_GST",
          placeOfSupply: customerCountry,
          reverseCharge: false,
          taxExempt,
          customerType,
          reasonCodes,
        };
      }
    }

    // ─── UK VAT ────────────────────────────────────────────────
    if (sellerCountry === "GB" || sellerCountry === "UK") {
      if (customerCountry === "GB" || customerCountry === "UK") {
        reasonCodes.push("UK_DOMESTIC_VAT");
        return {
          sellerCountry: "GB",
          customerCountry: "GB",
          supplyClassification: "domestic",
          taxRegime: "UK_VAT",
          placeOfSupply: "GB",
          reverseCharge: false,
          taxExempt,
          customerType,
          reasonCodes,
        };
      } else {
        reasonCodes.push("UK_EXPORT_OUTSIDE_SCOPE");
        return {
          sellerCountry: "GB",
          customerCountry,
          supplyClassification: "export",
          taxRegime: "UK_VAT",
          placeOfSupply: customerCountry,
          reverseCharge: false,
          taxExempt,
          customerType,
          reasonCodes,
        };
      }
    }

    // ─── EU VAT ────────────────────────────────────────────────
    if (EU_COUNTRIES.has(sellerCountry)) {
      if (customerCountry === sellerCountry) {
        reasonCodes.push("EU_DOMESTIC_VAT");
        return {
          sellerCountry,
          customerCountry,
          supplyClassification: "domestic",
          taxRegime: "EU_VAT",
          placeOfSupply: customerCountry,
          reverseCharge: false,
          taxExempt,
          customerType,
          reasonCodes,
        };
      } else if (EU_COUNTRIES.has(customerCountry)) {
        if (customerType === "B2B") {
          reasonCodes.push("EU_CROSS_BORDER_B2B_REVERSE_CHARGE");
          return {
            sellerCountry,
            customerCountry,
            supplyClassification: "inter_state",
            taxRegime: "EU_VAT",
            placeOfSupply: customerCountry,
            reverseCharge: true,
            taxExempt,
            customerType,
            reasonCodes,
          };
        } else {
          reasonCodes.push("EU_CROSS_BORDER_B2C_VAT");
          return {
            sellerCountry,
            customerCountry,
            supplyClassification: "inter_state",
            taxRegime: "EU_VAT",
            placeOfSupply: customerCountry,
            reverseCharge: false,
            taxExempt,
            customerType,
            reasonCodes,
          };
        }
      } else {
        reasonCodes.push("EU_EXPORT_OUTSIDE_SCOPE");
        return {
          sellerCountry,
          customerCountry,
          supplyClassification: "export",
          taxRegime: "EU_VAT",
          placeOfSupply: customerCountry,
          reverseCharge: false,
          taxExempt,
          customerType,
          reasonCodes,
        };
      }
    }

    // ─── Default / Other Jurisdiction ──────────────────────────
    reasonCodes.push("OTHER_JURISDICTION");
    return {
      sellerCountry,
      sellerRegion,
      customerCountry,
      customerRegion,
      supplyClassification: "domestic",
      taxRegime: "OTHER",
      placeOfSupply,
      reverseCharge: false,
      taxExempt,
      customerType,
      reasonCodes,
    };
  }
}
