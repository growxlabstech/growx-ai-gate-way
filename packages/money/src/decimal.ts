export type RoundingMode =
  | "HALF_UP"
  | "HALF_EVEN"
  | "UP"
  | "DOWN"
  | "CEIL"
  | "FLOOR";

/**
 * Standard internal arithmetic scale for high-precision financial operations.
 * 10^18 gives 18 fractional decimal digits, safely supporting sub-satoshi / sub-cent
 * microcurrency token calculations without precision loss.
 */
export const DECIMAL_INTERNAL_SCALE = 18;
const INTERNAL_FACTOR = 10n ** BigInt(DECIMAL_INTERNAL_SCALE);

/**
 * Immutable arbitrary-scale Decimal implementation for financial calculations.
 * Avoids JavaScript IEEE-754 floating-point inaccuracies.
 */
export class Decimal {
  private readonly _value: bigint; // Stored scaled by 10^18

  public constructor(value: Decimal | string | number | bigint = 0n) {
    if (value instanceof Decimal) {
      this._value = value._value;
    } else if (typeof value === "string") {
      this._value = Decimal.fromString(value)._value;
    } else if (typeof value === "number") {
      if (!Number.isFinite(value) || Number.isNaN(value)) {
        throw new Error(`Invalid Decimal number value: ${value}`);
      }
      this._value = Decimal.fromString(value.toString())._value;
    } else if (typeof value === "bigint") {
      this._value = value * INTERNAL_FACTOR;
    } else {
      throw new Error(`Cannot construct Decimal from ${typeof value}`);
    }
  }

  /**
   * Internal constructor for already-scaled 10^18 bigint values.
   */
  public static raw(scaledValue: bigint): Decimal {
    const d = Object.create(Decimal.prototype) as Decimal;
    (d as any)._value = scaledValue;
    return d;
  }

  public static readonly ZERO = Decimal.raw(0n);
  public static readonly ONE = Decimal.raw(INTERNAL_FACTOR);

  /**
   * Constructs a Decimal from a string, number, bigint, or existing Decimal.
   */
  public static from(value: Decimal | string | number | bigint): Decimal {
    if (value instanceof Decimal) {
      return value;
    }
    return new Decimal(value);
  }

  private static fromString(str: string): Decimal {
    const trimmed = str.trim();
    if (!trimmed) {
      throw new Error("Cannot parse empty string as Decimal");
    }

    if (!/^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(trimmed)) {
      throw new Error(`Invalid Decimal string format: "${str}"`);
    }

    // Handle scientific notation if present
    if (/[eE]/.test(trimmed)) {
      const [coeffStr, expStr] = trimmed.split(/[eE]/);
      const exp = parseInt(expStr!, 10);
      const coeff = Decimal.fromString(coeffStr!);
      if (exp >= 0) {
        return coeff.mul(Decimal.raw(10n ** BigInt(exp) * INTERNAL_FACTOR));
      } else {
        return coeff.div(Decimal.raw(10n ** BigInt(Math.abs(exp)) * INTERNAL_FACTOR));
      }
    }

    const isNegative = trimmed.startsWith("-");
    const clean = isNegative ? trimmed.slice(1) : trimmed;
    const [wholePart = "0", fracPart = ""] = clean.split(".");

    const paddedFrac = fracPart.padEnd(DECIMAL_INTERNAL_SCALE, "0");
    const fracWithinScale = paddedFrac.slice(0, DECIMAL_INTERNAL_SCALE);
    const wholeBig = BigInt(wholePart);
    const fracBig = BigInt(fracWithinScale);

    let raw = wholeBig * INTERNAL_FACTOR + fracBig;
    if (isNegative) {
      raw = -raw;
    }

    return Decimal.raw(raw);
  }

  /**
   * Computes: (quantity * price) / perUnits with exact precision.
   */
  public static fromUnits(
    quantity: bigint | number | Decimal,
    price: Decimal | string | number | bigint,
    perUnits: bigint | number | Decimal = 1_000_000n
  ): Decimal {
    const qDec = Decimal.from(quantity);
    const pDec = Decimal.from(price);
    const uDec = Decimal.from(perUnits);

    if (uDec.isZero()) {
      throw new Error("perUnits cannot be zero");
    }

    return qDec.mul(pDec).div(uDec);
  }

  public add(other: Decimal | string | number | bigint): Decimal {
    const o = Decimal.from(other);
    return Decimal.raw(this._value + o._value);
  }

  public sub(other: Decimal | string | number | bigint): Decimal {
    const o = Decimal.from(other);
    return Decimal.raw(this._value - o._value);
  }

  public mul(other: Decimal | string | number | bigint): Decimal {
    const o = Decimal.from(other);
    // Multiply bigints and scale back down by 10^18 with HALF_UP rounding
    const product = this._value * o._value;
    const isNeg = product < 0n;
    const absProd = isNeg ? -product : product;
    const rounded = (absProd + INTERNAL_FACTOR / 2n) / INTERNAL_FACTOR;
    return Decimal.raw(isNeg ? -rounded : rounded);
  }

  public div(other: Decimal | string | number | bigint): Decimal {
    const o = Decimal.from(other);
    if (o.isZero()) {
      throw new Error("Division by zero in Decimal");
    }
    // Scale numerator up by 10^18 before dividing with HALF_UP rounding
    const scaledNum = this._value * INTERNAL_FACTOR;
    const isNeg = (scaledNum < 0n) !== (o._value < 0n);
    const absNum = scaledNum < 0n ? -scaledNum : scaledNum;
    const absDen = o._value < 0n ? -o._value : o._value;

    const rounded = (absNum + absDen / 2n) / absDen;
    return Decimal.raw(isNeg ? -rounded : rounded);
  }

  public neg(): Decimal {
    return Decimal.raw(-this._value);
  }

  public abs(): Decimal {
    return this._value < 0n ? Decimal.raw(-this._value) : this;
  }

  public isZero(): boolean {
    return this._value === 0n;
  }

  public isPositive(): boolean {
    return this._value > 0n;
  }

  public isNegative(): boolean {
    return this._value < 0n;
  }

  public eq(other: Decimal | string | number | bigint): boolean {
    return this._value === Decimal.from(other)._value;
  }

  public lt(other: Decimal | string | number | bigint): boolean {
    return this._value < Decimal.from(other)._value;
  }

  public lte(other: Decimal | string | number | bigint): boolean {
    return this._value <= Decimal.from(other)._value;
  }

  public gt(other: Decimal | string | number | bigint): boolean {
    return this._value > Decimal.from(other)._value;
  }

  public gte(other: Decimal | string | number | bigint): boolean {
    return this._value >= Decimal.from(other)._value;
  }

  public static min(...values: (Decimal | string | number | bigint)[]): Decimal {
    if (values.length === 0) {
      throw new Error("Decimal.min requires at least one argument");
    }
    let minVal = Decimal.from(values[0]!);
    for (let i = 1; i < values.length; i++) {
      const val = Decimal.from(values[i]!);
      if (val.lt(minVal)) {
        minVal = val;
      }
    }
    return minVal;
  }

  public static max(...values: (Decimal | string | number | bigint)[]): Decimal {
    if (values.length === 0) {
      throw new Error("Decimal.max requires at least one argument");
    }
    let maxVal = Decimal.from(values[0]!);
    for (let i = 1; i < values.length; i++) {
      const val = Decimal.from(values[i]!);
      if (val.gt(maxVal)) {
        maxVal = val;
      }
    }
    return maxVal;
  }

  public static sum(...values: (Decimal | string | number | bigint)[]): Decimal {
    let total = Decimal.ZERO;
    for (const v of values) {
      total = total.add(v);
    }
    return total;
  }

  /**
   * Converts the Decimal to minor currency units (e.g. cents for USD, paise for INR).
   */
  public toMinorUnits(minorDigits: number = 2, rounding: RoundingMode = "HALF_UP"): bigint {
    const scaleFactor = 10n ** BigInt(DECIMAL_INTERNAL_SCALE - minorDigits);
    const isNeg = this._value < 0n;
    const absVal = isNeg ? -this._value : this._value;

    let res: bigint;
    const whole = absVal / scaleFactor;
    const rem = absVal % scaleFactor;
    const half = scaleFactor / 2n;

    switch (rounding) {
      case "HALF_UP":
        res = rem >= half ? whole + 1n : whole;
        break;
      case "HALF_EVEN":
        if (rem > half) {
          res = whole + 1n;
        } else if (rem < half) {
          res = whole;
        } else {
          res = whole % 2n === 0n ? whole : whole + 1n;
        }
        break;
      case "UP":
        res = rem > 0n ? whole + 1n : whole;
        break;
      case "DOWN":
        res = whole;
        break;
      case "CEIL":
        if (isNeg) {
          res = whole;
        } else {
          res = rem > 0n ? whole + 1n : whole;
        }
        break;
      case "FLOOR":
        if (isNeg) {
          res = rem > 0n ? whole + 1n : whole;
        } else {
          res = whole;
        }
        break;
    }

    return isNeg ? -res : res;
  }

  /**
   * Returns the integer BigInt value, rounding to nearest integer.
   */
  public toBigInt(rounding: RoundingMode = "HALF_UP"): bigint {
    return this.toMinorUnits(0, rounding);
  }

  /**
   * Rounds the Decimal to the specified number of decimal places.
   */
  public round(decimalPlaces: number = 0, rounding: RoundingMode = "HALF_UP"): Decimal {
    const minor = this.toMinorUnits(decimalPlaces, rounding);
    return Decimal.fromMinorUnits(minor, decimalPlaces);
  }

  /**
   * Constructs a Decimal from minor currency units.
   */
  public static fromMinorUnits(minorUnits: bigint | number, minorDigits: number = 2): Decimal {
    const m = BigInt(minorUnits);
    const scaleFactor = 10n ** BigInt(DECIMAL_INTERNAL_SCALE - minorDigits);
    return Decimal.raw(m * scaleFactor);
  }

  /**
   * Rounds the Decimal to the specified number of decimal places.
   */
  public toFixed(decimalPlaces: number = 2, rounding: RoundingMode = "HALF_UP"): string {
    if (decimalPlaces < 0) {
      throw new Error("Decimal places must be non-negative");
    }
    const minor = this.toMinorUnits(decimalPlaces, rounding);
    const isNeg = minor < 0n;
    const absMinor = isNeg ? -minor : minor;

    const div = 10n ** BigInt(decimalPlaces);
    const whole = absMinor / div;
    const frac = absMinor % div;

    const fracStr = frac.toString().padStart(decimalPlaces, "0");
    const sign = isNeg ? "-" : "";

    if (decimalPlaces === 0) {
      return `${sign}${whole.toString()}`;
    }
    return `${sign}${whole.toString()}.${fracStr}`;
  }

  /**
   * Serializes the Decimal into standard string notation (stripping redundant trailing zeroes).
   */
  public toString(): string {
    if (this._value === 0n) {
      return "0";
    }

    const isNeg = this._value < 0n;
    const absVal = isNeg ? -this._value : this._value;

    const whole = absVal / INTERNAL_FACTOR;
    const frac = absVal % INTERNAL_FACTOR;

    const sign = isNeg ? "-" : "";
    if (frac === 0n) {
      return `${sign}${whole.toString()}`;
    }

    let fracStr = frac.toString().padStart(DECIMAL_INTERNAL_SCALE, "0");
    // Strip trailing zeros
    fracStr = fracStr.replace(/0+$/, "");

    return `${sign}${whole.toString()}.${fracStr}`;
  }

  /**
   * Returns a standard JavaScript Number (use for display/metrics only, never authoritative accounting).
   */
  public toNumber(): number {
    return parseFloat(this.toString());
  }

  public toJSON(): string {
    return this.toString();
  }
}
