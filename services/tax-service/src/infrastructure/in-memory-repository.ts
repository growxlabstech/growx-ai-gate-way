import type {
  BillingProfile,
  LegalEntity,
  TaxRule,
} from "@growx/tax";
import type { ITaxRepository } from "../domain/types.js";

export class InMemoryTaxRepository implements ITaxRepository {
  public readonly legalEntities = new Map<string, LegalEntity>();
  public readonly billingProfiles = new Map<string, BillingProfile>(); // key: organizationId
  public readonly taxRules = new Map<string, TaxRule>();

  async createLegalEntity(entity: LegalEntity): Promise<LegalEntity> {
    this.legalEntities.set(entity.id, entity);
    return entity;
  }

  async getLegalEntity(id: string): Promise<LegalEntity | undefined> {
    return this.legalEntities.get(id);
  }

  async getLegalEntityByCode(code: string): Promise<LegalEntity | undefined> {
    return Array.from(this.legalEntities.values()).find((e) => e.code === code);
  }

  async listLegalEntities(): Promise<LegalEntity[]> {
    return Array.from(this.legalEntities.values());
  }

  async updateLegalEntity(id: string, updates: Partial<LegalEntity>): Promise<LegalEntity> {
    const existing = this.legalEntities.get(id);
    if (!existing) throw new Error(`Legal entity not found: ${id}`);
    const updated = { ...existing, ...updates, updatedAt: new Date() };
    this.legalEntities.set(id, updated);
    return updated;
  }

  async createBillingProfile(profile: BillingProfile): Promise<BillingProfile> {
    this.billingProfiles.set(profile.organizationId, profile);
    return profile;
  }

  async getBillingProfile(organizationId: string): Promise<BillingProfile | undefined> {
    return this.billingProfiles.get(organizationId);
  }

  async updateBillingProfile(
    organizationId: string,
    updates: Partial<BillingProfile>
  ): Promise<BillingProfile> {
    const existing = this.billingProfiles.get(organizationId);
    if (!existing) throw new Error(`Billing profile not found for org: ${organizationId}`);
    const updated = { ...existing, ...updates, updatedAt: new Date() };
    this.billingProfiles.set(organizationId, updated);
    return updated;
  }

  async createTaxRule(rule: TaxRule): Promise<TaxRule> {
    this.taxRules.set(rule.id, rule);
    return rule;
  }

  async getTaxRule(id: string): Promise<TaxRule | undefined> {
    return this.taxRules.get(id);
  }

  async listActiveTaxRules(asOf: Date = new Date()): Promise<TaxRule[]> {
    return Array.from(this.taxRules.values()).filter((r) => {
      if (r.status !== "active") return false;
      if (r.effectiveFrom > asOf) return false;
      if (r.effectiveTo && r.effectiveTo < asOf) return false;
      return true;
    });
  }

  async updateTaxRule(id: string, updates: Partial<TaxRule>): Promise<TaxRule> {
    const existing = this.taxRules.get(id);
    if (!existing) throw new Error(`Tax rule not found: ${id}`);
    const updated = { ...existing, ...updates };
    this.taxRules.set(id, updated);
    return updated;
  }
}
