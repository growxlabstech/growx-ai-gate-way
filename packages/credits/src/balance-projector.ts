import { Decimal } from "@growx/money";
import type { CreditLot, WalletBalance, WalletLedgerEntry } from "./types.js";

export interface ProjectedBalance {
  total: Decimal;
  available: Decimal;
  reserved: Decimal;
}

/**
 * Calculates current balance projections directly from active credit lots.
 */
export function calculateBalanceFromLots(
  lots: readonly CreditLot[],
  now: Date = new Date(),
): ProjectedBalance {
  let total = Decimal.ZERO;
  let reserved = Decimal.ZERO;

  for (const lot of lots) {
    const isUnexpired =
      lot.expiresAt === null ||
      lot.expiresAt === undefined ||
      lot.expiresAt.getTime() > now.getTime();

    if (isUnexpired) {
      total = total.add(lot.remainingAmount);
      reserved = reserved.add(lot.reservedAmount);
    }
  }

  const available = total.sub(reserved);

  return {
    total,
    reserved,
    available: available.lt(Decimal.ZERO) ? Decimal.ZERO : available,
  };
}

/**
 * Rebuilds the authoritative wallet balance by sequentially applying immutable ledger entries.
 */
export function calculateBalanceFromLedger(
  entries: readonly WalletLedgerEntry[],
  walletId: string,
): WalletBalance {
  // Sort entries strictly by monotonic sequence
  const sorted = [...entries].sort((a, b) => {
    if (a.sequence < b.sequence) return -1;
    if (a.sequence > b.sequence) return 1;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });

  let total = Decimal.ZERO;
  let reserved = Decimal.ZERO;
  let available = Decimal.ZERO;

  for (const entry of sorted) {
    switch (entry.entryType) {
      case "credit_grant":
      case "credit_purchase_future":
      case "adjustment_credit":
      case "refund":
        total = total.add(entry.amount);
        available = available.add(entry.amount);
        break;

      case "reservation":
        // Moves funds from available to reserved
        available = available.sub(entry.amount);
        reserved = reserved.add(entry.amount);
        break;

      case "reservation_release":
        // Restores funds from reserved back to available
        reserved = reserved.sub(entry.amount);
        available = available.add(entry.amount);
        break;

      case "usage_settlement":
        // Consumes funds permanently from reserved
        reserved = reserved.sub(entry.amount);
        total = total.sub(entry.amount);
        break;

      case "adjustment_debit":
      case "expiration":
        // Debits funds directly from available and total
        available = available.sub(entry.amount);
        total = total.sub(entry.amount);
        break;
    }
  }

  return {
    walletId,
    total,
    reserved: reserved.lt(Decimal.ZERO) ? Decimal.ZERO : reserved,
    available: available.lt(Decimal.ZERO) ? Decimal.ZERO : available,
    version: sorted.length,
    updatedAt:
      sorted.length > 0 ? sorted[sorted.length - 1]!.createdAt : new Date(),
  };
}

export interface BalanceIntegrityCheck {
  matches: boolean;
  discrepancies: string[];
}

/**
 * Verifies that the materialized WalletBalance matches the calculated projection.
 */
export function verifyBalanceIntegrity(
  materialized: WalletBalance,
  calculated: ProjectedBalance,
): BalanceIntegrityCheck {
  const discrepancies: string[] = [];

  if (!materialized.total.eq(calculated.total)) {
    discrepancies.push(
      `Total balance mismatch: materialized=${materialized.total.toString()}, calculated=${calculated.total.toString()}`,
    );
  }

  if (!materialized.reserved.eq(calculated.reserved)) {
    discrepancies.push(
      `Reserved balance mismatch: materialized=${materialized.reserved.toString()}, calculated=${calculated.reserved.toString()}`,
    );
  }

  if (!materialized.available.eq(calculated.available)) {
    discrepancies.push(
      `Available balance mismatch: materialized=${materialized.available.toString()}, calculated=${calculated.available.toString()}`,
    );
  }

  return {
    matches: discrepancies.length === 0,
    discrepancies,
  };
}
