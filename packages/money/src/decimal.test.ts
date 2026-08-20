import { describe, expect, it } from "vitest";
import { Decimal } from "./decimal.js";

describe("Decimal", () => {
  it("creates Decimal from string, number, bigint, Decimal", () => {
    expect(Decimal.from("5").toString()).toBe("5");
    expect(Decimal.from("5.00").toString()).toBe("5");
    expect(Decimal.from("5.25").toString()).toBe("5.25");
    expect(Decimal.from(10).toString()).toBe("10");
    expect(Decimal.from(100n).toString()).toBe("100");
    expect(Decimal.from(Decimal.from("3.14")).toString()).toBe("3.14");
  });

  it("handles negative numbers and zero correctly", () => {
    const neg = Decimal.from("-4.5");
    expect(neg.isNegative()).toBe(true);
    expect(neg.isPositive()).toBe(false);
    expect(neg.isZero()).toBe(false);
    expect(neg.abs().toString()).toBe("4.5");
    expect(neg.neg().toString()).toBe("4.5");

    const zero = Decimal.from("0");
    expect(zero.isZero()).toBe(true);
    expect(zero.toString()).toBe("0");
  });

  it("performs exact addition and subtraction without floating-point errors", () => {
    // 0.1 + 0.2 in standard JS float is 0.30000000000000004
    const a = Decimal.from("0.1");
    const b = Decimal.from("0.2");
    expect(a.add(b).toString()).toBe("0.3");
    expect(a.add(b).toFixed(2)).toBe("0.30");

    const diff = Decimal.from("10.50").sub("3.25");
    expect(diff.toString()).toBe("7.25");
  });

  it("performs high-precision token rate calculations", () => {
    // 1,000,000 input tokens at $5 / 1,000,000 = $5.00
    const cost1 = Decimal.fromUnits(1_000_000n, "5.00", 1_000_000n);
    expect(cost1.toString()).toBe("5");
    expect(cost1.toFixed(2)).toBe("5.00");

    // 100 input tokens at $5 / 1M = 0.0005
    const cost2 = Decimal.fromUnits(100n, "5.00", 1_000_000n);
    expect(cost2.toString()).toBe("0.0005");
    expect(cost2.toFixed(4)).toBe("0.0005");

    // 3,456 tokens at $2.50 / 1M = 0.00864
    const cost3 = Decimal.fromUnits(3456n, "2.50", 1_000_000n);
    expect(cost3.toString()).toBe("0.00864");
  });

  it("handles very large token counts without integer overflow", () => {
    const hugeTokens = 100_000_000_000n; // 100 Billion tokens
    const cost = Decimal.fromUnits(hugeTokens, "15.00", 1_000_000n);
    expect(cost.toString()).toBe("1500000");
  });

  it("supports comparisons", () => {
    const a = Decimal.from("1.50");
    const b = Decimal.from("1.500");
    const c = Decimal.from("2.00");

    expect(a.eq(b)).toBe(true);
    expect(a.lt(c)).toBe(true);
    expect(c.gt(a)).toBe(true);
    expect(a.lte(b)).toBe(true);
    expect(a.gte(b)).toBe(true);
  });

  it("applies rounding modes accurately", () => {
    const val = Decimal.from("1.235");

    // HALF_UP: 1.235 -> 1.24
    expect(val.round(2, "HALF_UP").toFixed(2)).toBe("1.24");

    // DOWN: 1.235 -> 1.23
    expect(val.round(2, "DOWN").toFixed(2)).toBe("1.23");

    // UP: 1.231 -> 1.24
    expect(Decimal.from("1.231").round(2, "UP").toFixed(2)).toBe("1.24");

    // HALF_EVEN (Banker's rounding)
    // 1.235 (odd before 5) -> 1.24
    expect(Decimal.from("1.235").round(2, "HALF_EVEN").toFixed(2)).toBe("1.24");
    // 1.245 (even before 5) -> 1.24
    expect(Decimal.from("1.245").round(2, "HALF_EVEN").toFixed(2)).toBe("1.24");
  });

  it("converts to minor currency units (cents)", () => {
    expect(Decimal.from("12.34").toMinorUnits(2)).toBe(1234n);
    expect(Decimal.from("0.005").toMinorUnits(2, "HALF_UP")).toBe(1n);
    expect(Decimal.from("0.004").toMinorUnits(2, "HALF_UP")).toBe(0n);
  });

  it("computes min, max, and sum", () => {
    const sum = Decimal.sum("1.1", "2.2", "3.3");
    expect(sum.toString()).toBe("6.6");

    expect(Decimal.min("5.5", "1.2", "9.9").toString()).toBe("1.2");
    expect(Decimal.max("5.5", "1.2", "9.9").toString()).toBe("9.9");
  });
});
