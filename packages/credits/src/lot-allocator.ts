import { Decimal } from "@growx/money";
import { createPublicId } from "@growx/ids";
import type {
  CreditLot,
  CreditLotType,
  ReservationAllocation,
} from "./types.js";

const lotTypePriority: Record<CreditLotType, number> = {
  promotional: 0,
  trial: 1,
  subscription: 2,
  purchased: 3,
  refund: 4,
  manual: 5,
};

/**
 * Sorts active credit lots deterministically by:
 * 1. Earliest expiry (non-expiring lots last)
 * 2. Lot type priority (promotional > trial > subscription > purchased > refund > manual)
 * 3. Grant timestamp (oldest first)
 * 4. Lot ID (lexical tie-breaker)
 */
export function consumptionOrder(
  lots: readonly CreditLot[],
  now: Date = new Date(),
): CreditLot[] {
  return lots
    .filter((lot) => {
      const availableInLot = lot.remainingAmount.sub(lot.reservedAmount);
      const isUnexpired =
        lot.expiresAt === null ||
        lot.expiresAt === undefined ||
        lot.expiresAt.getTime() > now.getTime();
      return availableInLot.gt(Decimal.ZERO) && isUnexpired;
    })
    .sort((a, b) => {
      // 1. Expiry comparison
      const aHasExpiry = a.expiresAt !== null && a.expiresAt !== undefined;
      const bHasExpiry = b.expiresAt !== null && b.expiresAt !== undefined;

      if (aHasExpiry && !bHasExpiry) return -1;
      if (!aHasExpiry && bHasExpiry) return 1;
      if (aHasExpiry && bHasExpiry) {
        const diff = a.expiresAt!.getTime() - b.expiresAt!.getTime();
        if (diff !== 0) return diff;
      }

      // 2. Lot Type priority
      const typeA = lotTypePriority[a.lotType] ?? 99;
      const typeB = lotTypePriority[b.lotType] ?? 99;
      if (typeA !== typeB) return typeA - typeB;

      // 3. Grant timestamp (FIFO)
      const grantDiff = a.grantedAt.getTime() - b.grantedAt.getTime();
      if (grantDiff !== 0) return grantDiff;

      // 4. Stable tie-breaker
      return a.id.localeCompare(b.id);
    });
}

export interface AllocationResult {
  allocations: ReservationAllocation[];
  updatedLots: CreditLot[];
  totalAllocated: Decimal;
}

/**
 * Allocates requested amount across credit lots in strict priority order.
 * Throws an Error with code "insufficient_credits" if available credit is insufficient.
 */
export function allocateCreditLots(
  lots: readonly CreditLot[],
  requiredAmount: Decimal,
  reservationId: string,
  now: Date = new Date(),
): AllocationResult {
  if (requiredAmount.lt(Decimal.ZERO)) {
    throw new Error("Required reservation amount cannot be negative");
  }

  if (requiredAmount.isZero()) {
    return {
      allocations: [],
      updatedLots: lots.map((lot) => ({ ...lot })),
      totalAllocated: Decimal.ZERO,
    };
  }

  let remainingToAllocate = requiredAmount;
  const allocations: ReservationAllocation[] = [];
  const lotMap = new Map<string, CreditLot>(lots.map((l) => [l.id, { ...l }]));

  const orderedLots = consumptionOrder(lots, now);

  for (const orderedLot of orderedLots) {
    const lot = lotMap.get(orderedLot.id)!;
    const availableInLot = lot.remainingAmount.sub(lot.reservedAmount);

    if (availableInLot.lte(Decimal.ZERO)) continue;

    const amountToTake = availableInLot.lt(remainingToAllocate)
      ? availableInLot
      : remainingToAllocate;

    allocations.push({
      id:
        createPublicId("alloc" as any) ||
        `alloc_${Date.now()}_${allocations.length}`,
      reservationId,
      creditLotId: lot.id,
      allocatedAmount: amountToTake,
      createdAt: new Date(),
    });

    lot.reservedAmount = lot.reservedAmount.add(amountToTake);
    remainingToAllocate = remainingToAllocate.sub(amountToTake);

    if (remainingToAllocate.isZero()) {
      break;
    }
  }

  if (remainingToAllocate.gt(Decimal.ZERO)) {
    const err = Object.assign(
      new Error(
        `Insufficient credits: needed ${requiredAmount.toString()}, short by ${remainingToAllocate.toString()}`,
      ),
      {
        code: "insufficient_credits",
        status: 402,
        required: requiredAmount,
        shortfall: remainingToAllocate,
      },
    );
    throw err;
  }

  return {
    allocations,
    updatedLots: Array.from(lotMap.values()),
    totalAllocated: requiredAmount,
  };
}
