import { describe, expect, it } from "vitest";
import {
  calculatePrice,
  providerTokenCost,
  selectPricingRule,
} from "./index.js";
describe("pricing", () => {
  it("applies hierarchy", () =>
    expect(
      selectPricingRule([
        {
          id: "a",
          versionId: "v",
          level: "platform",
          method: "markup",
          minimumMarginBasisPoints: 0n,
        },
        {
          id: "b",
          versionId: "v",
          level: "workspace",
          method: "markup",
          minimumMarginBasisPoints: 0n,
        },
      ]).id,
    ).toBe("b"));
  it("calculates markup and margin exactly", () => {
    const value = calculatePrice(
      { amountMinor: 100n, currency: "USD" },
      {
        id: "r",
        versionId: "v1",
        level: "plan",
        method: "markup",
        markupBasisPoints: 3000n,
        minimumMarginBasisPoints: 2000n,
      },
    );
    expect(value.customerCharge.amountMinor).toBe(130n);
    expect(value.grossMargin.amountMinor).toBe(30n);
  });
  it("prices token units with integer rounding", () =>
    expect(
      providerTokenCost({
        inputTokens: 1000n,
        outputTokens: 500n,
        cachedTokens: 0n,
        reasoningTokens: 0n,
        inputPerMillion: 100n,
        outputPerMillion: 200n,
        cachedPerMillion: 0n,
        reasoningPerMillion: 0n,
        currency: "USD",
      }).amountMinor,
    ).toBe(1n));
});
