import type {
  BillingProfile,
  LegalEntity,
  TaxRule,
} from "@growx/tax";

export interface ITaxRepository {
  // Legal entities
  createLegalEntity(entity: LegalEntity): Promise<LegalEntity>;
  getLegalEntity(id: string): Promise<LegalEntity | undefined>;
  getLegalEntityByCode(code: string): Promise<LegalEntity | undefined>;
  listLegalEntities(): Promise<LegalEntity[]>;
  updateLegalEntity(id: string, updates: Partial<LegalEntity>): Promise<LegalEntity>;

  // Customer billing profiles
  createBillingProfile(profile: BillingProfile): Promise<BillingProfile>;
  getBillingProfile(organizationId: string): Promise<BillingProfile | undefined>;
  updateBillingProfile(organizationId: string, updates: Partial<BillingProfile>): Promise<BillingProfile>;

  // Tax rules
  createTaxRule(rule: TaxRule): Promise<TaxRule>;
  getTaxRule(id: string): Promise<TaxRule | undefined>;
  listActiveTaxRules(asOf?: Date): Promise<TaxRule[]>;
  updateTaxRule(id: string, updates: Partial<TaxRule>): Promise<TaxRule>;
}
