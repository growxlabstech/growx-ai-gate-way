import { generateId } from "@growx/ids";
import { Decimal } from "@growx/money";
import {
  TaxEngine,
  TaxIdentifierValidator,
  type Address,
  type BillingProfile,
  type LegalEntity,
  type TaxCalculation,
  type TaxCalculationContext,
  type TaxDraftLine,
  type TaxIdentifier,
  type TaxIdentifierType,
  type TaxRegime,
  type TaxRule,
  type TaxType,
} from "@growx/tax";
import type { ITaxRepository } from "../domain/types.js";

export class TaxService {
  constructor(private readonly repository: ITaxRepository) {}

  // ─── Legal Entities (Seller) ─────────────────────────────────

  async createLegalEntity(params: {
    code: string;
    legalName: string;
    country: string;
    stateRegion?: string | undefined;
    registeredAddress: Address;
    taxIdentifiers?: { type: TaxIdentifierType; value: string }[] | undefined;
    invoicePrefix?: string | undefined;
  }): Promise<LegalEntity> {
    const existing = await this.repository.getLegalEntityByCode(params.code);
    if (existing) {
      throw new Error(`Legal entity with code ${params.code} already exists`);
    }

    const validatedTaxIds: TaxIdentifier[] = (params.taxIdentifiers ?? []).map((t) =>
      TaxIdentifierValidator.createTaxIdentifier({
        type: t.type,
        value: t.value,
        country: params.country,
        verified: true, // Internal seller configuration is pre-verified
      })
    );

    const now = new Date();
    const entity: LegalEntity = {
      id: generateId("le"),
      code: params.code,
      legalName: params.legalName,
      country: params.country.toUpperCase(),
      stateRegion: params.stateRegion?.toUpperCase(),
      registeredAddress: params.registeredAddress,
      taxIdentifiers: validatedTaxIds,
      invoicePrefix: params.invoicePrefix,
      status: "active",
      createdAt: now,
      updatedAt: now,
    };

    return this.repository.createLegalEntity(entity);
  }

  async getLegalEntity(id: string): Promise<LegalEntity | undefined> {
    return this.repository.getLegalEntity(id);
  }

  async getLegalEntityByCode(code: string): Promise<LegalEntity | undefined> {
    return this.repository.getLegalEntityByCode(code);
  }

  async listLegalEntities(): Promise<LegalEntity[]> {
    return this.repository.listLegalEntities();
  }

  // ─── Customer Billing Profiles ───────────────────────────────

  async getBillingProfile(organizationId: string): Promise<BillingProfile | undefined> {
    return this.repository.getBillingProfile(organizationId);
  }

  async upsertBillingProfile(
    organizationId: string,
    params: {
      legalName: string;
      billingEmail?: string | undefined;
      country: string;
      stateRegion?: string | undefined;
      postalCode?: string | undefined;
      city?: string | undefined;
      addressLine1: string;
      addressLine2?: string | undefined;
      taxIdentifiers?: { type: TaxIdentifierType; value: string }[] | undefined;
      billingCurrency?: string | undefined;
      taxExemptionStatus?: "none" | "exempt" | "pending_review" | undefined;
    }
  ): Promise<BillingProfile> {
    const existing = await this.repository.getBillingProfile(organizationId);
    const country = params.country.toUpperCase();

    // Validate tax identifiers syntax
    const validatedTaxIds: TaxIdentifier[] = (params.taxIdentifiers ?? []).map((t) =>
      TaxIdentifierValidator.createTaxIdentifier({
        type: t.type,
        value: t.value,
        country,
      })
    );

    const now = new Date();
    if (existing) {
      return this.repository.updateBillingProfile(organizationId, {
        legalName: params.legalName,
        billingEmail: params.billingEmail,
        country,
        stateRegion: params.stateRegion?.toUpperCase(),
        postalCode: params.postalCode,
        city: params.city,
        addressLine1: params.addressLine1,
        addressLine2: params.addressLine2,
        taxIdentifiers: validatedTaxIds,
        billingCurrency: params.billingCurrency ?? existing.billingCurrency,
        taxExemptionStatus: params.taxExemptionStatus ?? existing.taxExemptionStatus,
      });
    }

    const profile: BillingProfile = {
      id: generateId("bp"),
      organizationId,
      legalName: params.legalName,
      billingEmail: params.billingEmail,
      country,
      stateRegion: params.stateRegion?.toUpperCase(),
      postalCode: params.postalCode,
      city: params.city,
      addressLine1: params.addressLine1,
      addressLine2: params.addressLine2,
      taxIdentifiers: validatedTaxIds,
      billingCurrency: params.billingCurrency ?? "USD",
      taxExemptionStatus: params.taxExemptionStatus ?? "none",
      createdAt: now,
      updatedAt: now,
    };

    return this.repository.createBillingProfile(profile);
  }

  // ─── Tax Rules Management ────────────────────────────────────

  async createTaxRule(params: {
    regime: TaxRegime;
    jurisdiction: string;
    supplyType?: string | undefined;
    customerType?: "B2B" | "B2C" | undefined;
    productTaxCode?: string | undefined;
    taxType: TaxType;
    rate: Decimal | string | number;
    effectiveFrom: Date;
    effectiveTo?: Date | undefined;
    description?: string | undefined;
  }): Promise<TaxRule> {
    const rule: TaxRule = {
      id: generateId("trule"),
      regime: params.regime,
      jurisdiction: params.jurisdiction.toUpperCase(),
      supplyType: params.supplyType as any,
      customerType: params.customerType,
      productTaxCode: params.productTaxCode,
      taxType: params.taxType,
      rate: Decimal.from(params.rate),
      effectiveFrom: params.effectiveFrom,
      effectiveTo: params.effectiveTo,
      status: "active",
      version: 1,
      description: params.description,
    };

    return this.repository.createTaxRule(rule);
  }

  async activateTaxRule(id: string): Promise<TaxRule> {
    return this.repository.updateTaxRule(id, { status: "active" });
  }

  async retireTaxRule(id: string): Promise<TaxRule> {
    return this.repository.updateTaxRule(id, {
      status: "retired",
      effectiveTo: new Date(),
    });
  }

  async listActiveRules(asOf?: Date): Promise<TaxRule[]> {
    return this.repository.listActiveTaxRules(asOf);
  }

  // ─── Tax Calculation / Simulation ────────────────────────────

  async calculateTax(
    lines: readonly TaxDraftLine[],
    context: TaxCalculationContext
  ): Promise<TaxCalculation> {
    const activeRules = await this.repository.listActiveTaxRules(context.taxPointDate);
    return TaxEngine.calculate(lines, context, activeRules);
  }

  async simulateTax(
    lines: readonly TaxDraftLine[],
    context: TaxCalculationContext
  ): Promise<TaxCalculation> {
    return this.calculateTax(lines, context);
  }
}
