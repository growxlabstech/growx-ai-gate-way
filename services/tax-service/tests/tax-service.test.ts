import { describe, expect, it, beforeEach } from "vitest";
import { Decimal } from "@growx/money";
import { TaxService } from "../src/application/tax-service.js";
import { InMemoryTaxRepository } from "../src/infrastructure/in-memory-repository.js";

describe("Phase 20 — TaxService Application Service", () => {
  let taxService: TaxService;
  let taxRepo: InMemoryTaxRepository;

  beforeEach(() => {
    taxRepo = new InMemoryTaxRepository();
    taxService = new TaxService(taxRepo);
  });

  it("creates and retrieves a seller legal entity", async () => {
    const entity = await taxService.createLegalEntity({
      code: "GXL_IN",
      legalName: "GrowX Labs India Private Limited",
      country: "IN",
      stateRegion: "KA",
      registeredAddress: {
        addressLine1: "Tech Park",
        city: "Bengaluru",
        country: "IN",
      },
      taxIdentifiers: [{ type: "GSTIN", value: "29AABCG1234F1Z5" }],
      invoicePrefix: "GXL-IN",
    });

    expect(entity.id).toBeDefined();
    expect(entity.taxIdentifiers[0]!.validationStatus).toBe("verified");

    const fetched = await taxService.getLegalEntity(entity.id);
    expect(fetched).toBeDefined();
    expect(fetched!.code).toBe("GXL_IN");
  });

  it("upserts customer billing profile with syntax validation", async () => {
    const profile = await taxService.upsertBillingProfile("org_test_1", {
      legalName: "Test Customer Inc",
      country: "IN",
      stateRegion: "KA",
      addressLine1: "123 Main St",
      taxIdentifiers: [{ type: "GSTIN", value: "29XYZAB1234C1Z1" }],
    });

    expect(profile.organizationId).toBe("org_test_1");
    expect(profile.taxIdentifiers[0]!.validationStatus).toBe("syntactically_valid");

    // Update profile
    const updated = await taxService.upsertBillingProfile("org_test_1", {
      legalName: "Test Customer Updated",
      country: "IN",
      addressLine1: "456 New St",
    });

    expect(updated.legalName).toBe("Test Customer Updated");
  });

  it("creates, activates, and retires tax rules", async () => {
    const rule = await taxService.createTaxRule({
      regime: "INDIA_GST",
      jurisdiction: "IN",
      supplyType: "inter_state",
      taxType: "IGST",
      rate: "0.18",
      effectiveFrom: new Date("2020-01-01"),
    });

    expect(rule.status).toBe("active");

    const activeRules = await taxService.listActiveRules();
    expect(activeRules.length).toBe(1);

    await taxService.retireTaxRule(rule.id);
    const rulesAfterRetire = await taxService.listActiveRules();
    expect(rulesAfterRetire.length).toBe(0);
  });
});
