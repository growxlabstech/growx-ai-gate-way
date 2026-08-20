export * from "./decimal.js";

export const currencies = ["USD", "GBP", "EUR", "INR"] as const;
export type Currency = (typeof currencies)[number] | (string & {});

export const MICRO_SCALE = 1_000_000_000n;

export interface Money {
  amountMinor: bigint;
  currency: Currency;
}

export interface PreciseMoney {
  amount: bigint;
  scale: bigint;
  currency: Currency;
}

export function money(amountMinor: bigint, currency: Currency): Money {
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Invalid currency");
  return { amountMinor, currency };
}

export function precise(value: string, currency: Currency, scale = MICRO_SCALE): PreciseMoney {
  if (!/^-?\d+(?:\.\d+)?$/.test(value)) throw new Error("Invalid decimal amount");
  const negative = value.startsWith("-");
  const [whole, fraction = ""] = value.replace("-", "").split(".");
  const digits = scale.toString().length - 1;
  const amount = BigInt(whole!) * scale + BigInt(fraction.padEnd(digits, "0").slice(0, digits) || "0");
  return { amount: negative ? -amount : amount, scale, currency };
}

export function assertSameCurrency(a: { currency: Currency }, b: { currency: Currency }) {
  if (a.currency !== b.currency) throw new Error(`Currency mismatch: ${a.currency}/${b.currency}`);
}

export function add(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.amountMinor + b.amountMinor, a.currency);
}

export function subtract(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.amountMinor - b.amountMinor, a.currency);
}

export function multiplyRatio(
  amount: bigint,
  numerator: bigint,
  denominator: bigint,
  round: "up" | "down" = "up"
): bigint {
  if (denominator <= 0n || numerator < 0n) throw new Error("Invalid ratio");
  const product = amount * numerator;
  return round === "up" && product % denominator !== 0n
    ? product / denominator + 1n
    : product / denominator;
}

export interface ExchangeRate {
  sourceCurrency: Currency;
  targetCurrency: Currency;
  rateNumerator: bigint;
  rateDenominator: bigint;
  source: string;
  effectiveAt: Date;
}

export function convert(value: Money, rate: ExchangeRate): Money {
  if (value.currency !== rate.sourceCurrency) throw new Error("Exchange-rate source mismatch");
  return money(
    multiplyRatio(value.amountMinor, rate.rateNumerator, rate.rateDenominator),
    rate.targetCurrency
  );
}
