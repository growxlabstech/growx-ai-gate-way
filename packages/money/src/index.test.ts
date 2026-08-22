import { describe, expect, it } from "vitest";
import { add, convert, money, multiplyRatio, precise } from "./index.js";
describe("money", () => {
  it("uses exact integer arithmetic", () =>
    expect(add(money(1099n, "GBP"), money(1n, "GBP")).amountMinor).toBe(1100n));
  it("rejects silent currency mixing", () =>
    expect(() => add(money(1n, "USD"), money(1n, "EUR"))).toThrow(
      /Currency mismatch/,
    ));
  it("supports nano precision and exact ratios", () => {
    expect(precise("0.000000001", "USD").amount).toBe(1n);
    expect(multiplyRatio(100n, 130n, 100n)).toBe(130n);
  });
  it("retains exchange-rate provenance", () =>
    expect(
      convert(money(100n, "USD"), {
        sourceCurrency: "USD",
        targetCurrency: "INR",
        rateNumerator: 83n,
        rateDenominator: 1n,
        source: "test",
        effectiveAt: new Date(),
      }).amountMinor,
    ).toBe(8300n));
});
