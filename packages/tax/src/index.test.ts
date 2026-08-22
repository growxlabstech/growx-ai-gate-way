import { describe, expect, it } from "vitest";
import { Decimal } from "@growx/money";
import {
  TaxEngine,
  TaxIdentifierValidator,
  TaxJurisdictionResolver,
  type LegalEntity,
  type BillingProfile,
  type TaxRule,
} from "./index.js";

describe("Phase 20 — @growx/tax Package", () => {
  const sellerIndia: LegalEntity = {
    id: "le_india_1",
    code: "GXL_IN",
    legalName: "GrowX Labs India Private Limited",
    country: "IN",
    stateRegion: "KA", // Karnataka
    registeredAddress: {
      addressLine1: "123 Tech Park",
      city: "Bengaluru",
      stateRegion: "KA",
      postalCode: "560001",
      country: "IN",
    },
    taxIdentifiers: [
      {
        type: "GSTIN",
        value: "29AABCG1234F1Z5",
        country: "IN",
        validationStatus: "verified",
      },
    ],
    invoicePrefix: "GXL-IN",
    status: "active",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const sellerUK: LegalEntity = {
    id: "le_uk_1",
    code: "GXL_UK",
    legalName: "GrowX Labs UK Limited",
    country: "GB",
    registeredAddress: {
      addressLine1: "10 Downing St",
      city: "London",
      postalCode: "SW1A 2AA",
      country: "GB",
    },
    taxIdentifiers: [
      {
        type: "VAT_ID",
        value: "GB123456789",
        country: "GB",
        validationStatus: "verified",
      },
    ],
    status: "active",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const gstRules: TaxRule[] = [
    {
      id: "rule_cgst_9",
      regime: "INDIA_GST",
      jurisdiction: "IN",
      supplyType: "intra_state",
      taxType: "CGST",
      rate: Decimal.from("0.09"),
      effectiveFrom: new Date("2020-01-01"),
      status: "active",
      version: 1,
      productTaxCode: "998313",
    },
    {
      id: "rule_sgst_9",
      regime: "INDIA_GST",
      jurisdiction: "KA",
      supplyType: "intra_state",
      taxType: "SGST",
      rate: Decimal.from("0.09"),
      effectiveFrom: new Date("2020-01-01"),
      status: "active",
      version: 1,
      productTaxCode: "998313",
    },
    {
      id: "rule_igst_18",
      regime: "INDIA_GST",
      jurisdiction: "IN",
      supplyType: "inter_state",
      taxType: "IGST",
      rate: Decimal.from("0.18"),
      effectiveFrom: new Date("2020-01-01"),
      status: "active",
      version: 1,
      productTaxCode: "998313",
    },
    {
      id: "rule_uk_vat_20",
      regime: "UK_VAT",
      jurisdiction: "GB",
      supplyType: "domestic",
      taxType: "VAT",
      rate: Decimal.from("0.20"),
      effectiveFrom: new Date("2020-01-01"),
      status: "active",
      version: 1,
    },
  ];

  it("calculates India GST intra-state supply (CGST 9% + SGST 9%) for same state", () => {
    const customerKA: BillingProfile = {
      id: "bp_ka_1",
      organizationId: "org_ka",
      legalName: "Acme KA Corp",
      country: "IN",
      stateRegion: "KA", // Same as seller (KA)
      addressLine1: "Indiranagar",
      taxIdentifiers: [
        {
          type: "GSTIN",
          value: "29XYZAB1234C1Z1",
          country: "IN",
          validationStatus: "syntactically_valid",
        },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const calc = TaxEngine.calculate(
      [
        {
          description: "GrowX Pro Plan",
          quantity: 1,
          unitPrice: Decimal.from("100.00"),
          subtotal: Decimal.from("100.00"),
          productTaxCode: "998313",
        },
      ],
      {
        seller: sellerIndia,
        customer: customerKA,
        currency: "INR",
      },
      gstRules,
    );

    expect(calc.jurisdictionDecision.supplyClassification).toBe("intra_state");
    expect(calc.lines.length).toBe(2);
    expect(calc.lines[0]!.taxType).toBe("CGST");
    expect(calc.lines[0]!.taxAmount.toString()).toBe("9");
    expect(calc.lines[1]!.taxType).toBe("SGST");
    expect(calc.lines[1]!.taxAmount.toString()).toBe("9");
    expect(calc.subtotal.toString()).toBe("100");
    expect(calc.taxTotal.toString()).toBe("18");
    expect(calc.total.toString()).toBe("118");
  });

  it("calculates India GST inter-state supply (IGST 18%) for different state", () => {
    const customerMH: BillingProfile = {
      id: "bp_mh_1",
      organizationId: "org_mh",
      legalName: "Mumbai AI Ltd",
      country: "IN",
      stateRegion: "MH", // Different state (Maharashtra)
      addressLine1: "BKC",
      taxIdentifiers: [
        {
          type: "GSTIN",
          value: "27XYZAB1234C1Z1",
          country: "IN",
          validationStatus: "syntactically_valid",
        },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const calc = TaxEngine.calculate(
      [
        {
          description: "GrowX Enterprise Plan",
          quantity: 1,
          unitPrice: Decimal.from("200.00"),
          subtotal: Decimal.from("200.00"),
          productTaxCode: "998313",
        },
      ],
      {
        seller: sellerIndia,
        customer: customerMH,
        currency: "INR",
      },
      gstRules,
    );

    expect(calc.jurisdictionDecision.supplyClassification).toBe("inter_state");
    expect(calc.lines.length).toBe(1);
    expect(calc.lines[0]!.taxType).toBe("IGST");
    expect(calc.lines[0]!.taxAmount.toString()).toBe("36");
    expect(calc.subtotal.toString()).toBe("200");
    expect(calc.taxTotal.toString()).toBe("36");
    expect(calc.total.toString()).toBe("236");
  });

  it("calculates zero-rated export when customer is outside India", () => {
    const customerUS: BillingProfile = {
      id: "bp_us_1",
      organizationId: "org_us",
      legalName: "Silicon Valley Startup Inc",
      country: "US",
      addressLine1: "Palo Alto",
      taxIdentifiers: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const calc = TaxEngine.calculate(
      [
        {
          description: "GrowX Pro Plan",
          quantity: 1,
          unitPrice: Decimal.from("49.00"),
          subtotal: Decimal.from("49.00"),
        },
      ],
      {
        seller: sellerIndia,
        customer: customerUS,
        currency: "USD",
      },
      gstRules,
    );

    expect(calc.taxTreatment).toBe("zero_rated");
    expect(calc.taxTotal.toString()).toBe("0");
    expect(calc.total.toString()).toBe("49");
  });

  it("calculates UK domestic VAT (20%)", () => {
    const customerUK: BillingProfile = {
      id: "bp_uk_1",
      organizationId: "org_uk",
      legalName: "London Tech Ltd",
      country: "GB",
      addressLine1: "Silicon Roundabout",
      taxIdentifiers: [
        {
          type: "VAT_ID",
          value: "GB987654321",
          country: "GB",
          validationStatus: "syntactically_valid",
        },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const calc = TaxEngine.calculate(
      [
        {
          description: "GrowX Pro Plan",
          quantity: 1,
          unitPrice: Decimal.from("50.00"),
          subtotal: Decimal.from("50.00"),
        },
      ],
      {
        seller: sellerUK,
        customer: customerUK,
        currency: "GBP",
      },
      gstRules,
    );

    expect(calc.lines[0]!.taxType).toBe("VAT");
    expect(calc.taxTotal.toString()).toBe("10");
    expect(calc.total.toString()).toBe("60");
  });

  it("applies tax exemption when customer is explicitly marked tax exempt", () => {
    const customerExempt: BillingProfile = {
      id: "bp_ex_1",
      organizationId: "org_ex",
      legalName: "Govt Educational Foundation",
      country: "IN",
      stateRegion: "KA",
      addressLine1: "City Center",
      taxIdentifiers: [],
      taxExemptionStatus: "exempt",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const calc = TaxEngine.calculate(
      [
        {
          description: "GrowX Education Plan",
          quantity: 1,
          unitPrice: Decimal.from("100.00"),
          subtotal: Decimal.from("100.00"),
        },
      ],
      {
        seller: sellerIndia,
        customer: customerExempt,
        currency: "INR",
      },
      gstRules,
    );

    expect(calc.taxTreatment).toBe("exempt");
    expect(calc.taxTotal.toString()).toBe("0");
    expect(calc.total.toString()).toBe("100");
  });

  it("fails closed when no matching active tax rule is configured", () => {
    const sellerJapan: LegalEntity = {
      ...sellerIndia,
      country: "JP",
    };

    const customerJapan: BillingProfile = {
      id: "bp_jp_1",
      organizationId: "org_jp",
      legalName: "Tokyo AI",
      country: "JP",
      addressLine1: "Shinjuku",
      taxIdentifiers: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    expect(() =>
      TaxEngine.calculate(
        [
          {
            description: "Plan",
            quantity: 1,
            unitPrice: Decimal.from("1000"),
            subtotal: Decimal.from("1000"),
          },
        ],
        {
          seller: sellerJapan,
          customer: customerJapan,
          currency: "JPY",
        },
        gstRules,
      ),
    ).toThrow("No active tax rule found");
  });

  it("validates tax identifiers syntax properly", () => {
    // Valid GSTIN
    const validGstin = TaxIdentifierValidator.validate(
      "GSTIN",
      "29AABCG1234F1Z5",
      "IN",
    );
    expect(validGstin.isValid).toBe(true);
    expect(validGstin.status).toBe("syntactically_valid");

    // Invalid GSTIN (wrong length/chars)
    const invalidGstin = TaxIdentifierValidator.validate(
      "GSTIN",
      "12345",
      "IN",
    );
    expect(invalidGstin.isValid).toBe(false);
    expect(invalidGstin.status).toBe("invalid");

    // Valid UK VAT
    const validUkVat = TaxIdentifierValidator.validate(
      "VAT_ID",
      "GB123456789",
      "GB",
    );
    expect(validUkVat.isValid).toBe(true);

    // Valid US EIN
    const validEin = TaxIdentifierValidator.validate("EIN", "12-3456789", "US");
    expect(validEin.isValid).toBe(true);
  });
});
