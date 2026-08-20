import { Decimal } from "@growx/money";
import { TaxJurisdictionResolver } from "./jurisdiction-resolver.js";
import type {
  BillingProfile,
  InvoiceBillingProfileSnapshot,
  InvoiceLegalEntitySnapshot,
  LegalEntity,
  TaxCalculation,
  TaxJurisdictionDecision,
  TaxLine,
  TaxRule,
  TaxTreatment,
  TaxType,
} from "./types.js";

export interface TaxDraftLine {
  lineNumber?: number;
  description: string;
  quantity: number | bigint;
  unitPrice: Decimal;
  subtotal: Decimal;
  productTaxCode?: string | undefined; // e.g. SAC 998313
}

export interface TaxCalculationContext {
  seller: LegalEntity | InvoiceLegalEntitySnapshot;
  customer: BillingProfile | InvoiceBillingProfileSnapshot;
  placeOfSupply?: string | undefined;
  currency: string;
  taxPointDate?: Date | undefined;
  taxVersion?: number | undefined;
}

export class TaxEngine {
  /**
   * Deterministically calculates taxes for an invoice draft.
   * Uses exact Decimal arithmetic and fails closed when no valid rule matches.
   */
  static calculate(
    lines: readonly TaxDraftLine[],
    context: TaxCalculationContext,
    rules: readonly TaxRule[]
  ): TaxCalculation {
    const taxPointDate = context.taxPointDate ?? new Date();
    const taxVersion = context.taxVersion ?? 1;

    // 1. Resolve Jurisdiction
    const decision = TaxJurisdictionResolver.resolve({
      seller: context.seller,
      customer: context.customer,
      placeOfSupply: context.placeOfSupply,
    });

    // Compute subtotal from draft lines
    let subtotal = Decimal.ZERO;
    for (const line of lines) {
      subtotal = subtotal.add(line.subtotal);
    }

    // 2. Handle Exemptions
    if (decision.taxExempt) {
      return {
        jurisdictionDecision: decision,
        lines: [
          {
            taxType: "NONE",
            rate: Decimal.ZERO,
            taxableAmount: subtotal,
            taxAmount: Decimal.ZERO,
            jurisdiction: decision.customerCountry,
            description: "Tax Exempt",
          },
        ],
        subtotal,
        taxTotal: Decimal.ZERO,
        total: subtotal,
        currency: context.currency,
        taxVersion,
        calculatedAt: taxPointDate,
        taxTreatment: "exempt",
      };
    }

    // 3. Handle Reverse Charge
    if (decision.reverseCharge) {
      return {
        jurisdictionDecision: decision,
        lines: [
          {
            taxType: "VAT",
            rate: Decimal.ZERO,
            taxableAmount: subtotal,
            taxAmount: Decimal.ZERO,
            jurisdiction: decision.customerCountry,
            description: "B2B Reverse Charge — Customer to account for VAT",
          },
        ],
        subtotal,
        taxTotal: Decimal.ZERO,
        total: subtotal,
        currency: context.currency,
        taxVersion,
        calculatedAt: taxPointDate,
        taxTreatment: "reverse_charge",
      };
    }

    // 4. Handle Exports (Zero Rated)
    if (decision.supplyClassification === "export") {
      return {
        jurisdictionDecision: decision,
        lines: [
          {
            taxType: "NONE",
            rate: Decimal.ZERO,
            taxableAmount: subtotal,
            taxAmount: Decimal.ZERO,
            jurisdiction: decision.sellerCountry,
            description: "Zero-Rated Export of Services",
          },
        ],
        subtotal,
        taxTotal: Decimal.ZERO,
        total: subtotal,
        currency: context.currency,
        taxVersion,
        calculatedAt: taxPointDate,
        taxTreatment: "zero_rated",
      };
    }

    // 5. Active Rule Evaluation
    const activeRules = rules.filter((r) => {
      if (r.status !== "active") return false;
      if (r.regime !== decision.taxRegime) return false;
      if (r.effectiveFrom > taxPointDate) return false;
      if (r.effectiveTo && r.effectiveTo < taxPointDate) return false;
      if (r.supplyType && r.supplyType !== decision.supplyClassification) return false;
      if (r.customerType && r.customerType !== decision.customerType) return false;
      return true;
    });

    if (activeRules.length === 0) {
      throw new Error(
        `Tax calculation failed: No active tax rule found for regime ${decision.taxRegime} (supply: ${decision.supplyClassification}, customer: ${decision.customerType}). Refusing to guess zero tax.`
      );
    }

    const taxLines: TaxLine[] = [];
    let taxTotal = Decimal.ZERO;

    // Evaluate rules for the subtotal
    if (decision.taxRegime === "INDIA_GST") {
      if (decision.supplyClassification === "intra_state") {
        // CGST + SGST
        const cgstRule = activeRules.find((r) => r.taxType === "CGST");
        const sgstRule = activeRules.find((r) => r.taxType === "SGST");

        if (!cgstRule || !sgstRule) {
          throw new Error("Missing CGST or SGST rule for India intra-state supply");
        }

        const cgstAmount = subtotal.mul(cgstRule.rate).round(2);
        const sgstAmount = subtotal.mul(sgstRule.rate).round(2);

        taxLines.push(
          {
            taxType: "CGST",
            rate: cgstRule.rate,
            taxableAmount: subtotal,
            taxAmount: cgstAmount,
            jurisdiction: "IN",
            ruleId: cgstRule.id,
            description: `Central GST (${cgstRule.rate.mul(100).toString()}%)`,
            sacHsnCode: cgstRule.productTaxCode ?? "998313",
          },
          {
            taxType: "SGST",
            rate: sgstRule.rate,
            taxableAmount: subtotal,
            taxAmount: sgstAmount,
            jurisdiction: decision.sellerRegion ?? "IN",
            ruleId: sgstRule.id,
            description: `State GST (${sgstRule.rate.mul(100).toString()}%)`,
            sacHsnCode: sgstRule.productTaxCode ?? "998313",
          }
        );

        taxTotal = cgstAmount.add(sgstAmount);
      } else {
        // Inter-state IGST
        const igstRule = activeRules.find((r) => r.taxType === "IGST");
        if (!igstRule) {
          throw new Error("Missing IGST rule for India inter-state supply");
        }

        const igstAmount = subtotal.mul(igstRule.rate).round(2);
        taxLines.push({
          taxType: "IGST",
          rate: igstRule.rate,
          taxableAmount: subtotal,
          taxAmount: igstAmount,
          jurisdiction: "IN",
          ruleId: igstRule.id,
          description: `Integrated GST (${igstRule.rate.mul(100).toString()}%)`,
          sacHsnCode: igstRule.productTaxCode ?? "998313",
        });

        taxTotal = igstAmount;
      }
    } else {
      // General VAT or standard rate
      const mainRule = activeRules[0];
      if (mainRule) {
        const taxAmount = subtotal.mul(mainRule.rate).round(2);

        taxLines.push({
          taxType: mainRule.taxType,
          rate: mainRule.rate,
          taxableAmount: subtotal,
          taxAmount,
          jurisdiction: mainRule.jurisdiction,
          ruleId: mainRule.id,
          description: mainRule.description ?? `${mainRule.taxType} (${mainRule.rate.mul(100).toString()}%)`,
        });

        taxTotal = taxAmount;
      }
    }

    const total = subtotal.add(taxTotal);

    return {
      jurisdictionDecision: decision,
      lines: taxLines,
      subtotal,
      taxTotal,
      total,
      currency: context.currency,
      taxVersion,
      calculatedAt: taxPointDate,
      taxTreatment: "standard",
    };
  }
}
