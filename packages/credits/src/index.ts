export * from "./types.js";
export * from "./lot-allocator.js";
export * from "./balance-projector.js";

import type { CreditConversionVersion } from "./types.js";

export function moneyToCredits(
  amountMinor: bigint,
  version: CreditConversionVersion,
): bigint {
  const product = amountMinor * version.creditsNumerator;
  return (
    (product + version.moneyMinorDenominator - 1n) /
    version.moneyMinorDenominator
  );
}
