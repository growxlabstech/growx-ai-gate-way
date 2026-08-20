import { describe, expect, it } from "vitest";
import { Decimal } from "@growx/money";
import {
  allocateCreditLots,
  calculateBalanceFromLedger,
  calculateBalanceFromLots,
  consumptionOrder,
  verifyBalanceIntegrity,
  type CreditLot,
  type WalletLedgerEntry,
} from "./index.js";

function createLot(
  id: string,
  lotType: CreditLot["lotType"],
  amount: string,
  expiresAt: Date | null = null,
  grantedAt: Date = new Date("2026-01-01T00:00:00Z")
): CreditLot {
  const dec = new Decimal(amount);
  return {
    id,
    walletId: "wal_1",
    organizationId: "org_1",
    lotType,
    currency: "USD",
    originalAmount: dec,
    remainingAmount: dec,
    reservedAmount: Decimal.ZERO,
    sourceType: "grant",
    sourceId: id,
    grantedAt,
    expiresAt,
    createdAt: grantedAt,
  };
}

describe("Credit Domain Engine", () => {
  it("orders credit lots by earliest expiry, priority type, then grant date", () => {
    const lot1 = createLot("lot_purchased", "purchased", "100.00", null);
    const lot2 = createLot("lot_promo_expiring", "promotional", "20.00", new Date("2026-06-01T00:00:00Z"));
    const lot3 = createLot("lot_trial_expiring_earlier", "trial", "10.00", new Date("2026-03-01T00:00:00Z"));
    const lot4 = createLot("lot_subscription", "subscription", "50.00", null, new Date("2026-01-02T00:00:00Z"));

    const ordered = consumptionOrder([lot1, lot2, lot3, lot4], new Date("2026-01-01T00:00:00Z"));

    // 1. Earlier expiry first: lot3 (March)
    // 2. Later expiry next: lot2 (June)
    // 3. Non-expiring subscription (lotType priority 2 > purchased 3)
    // 4. Non-expiring purchased (lotType priority 3)
    expect(ordered.map((l) => l.id)).toEqual([
      "lot_trial_expiring_earlier",
      "lot_promo_expiring",
      "lot_subscription",
      "lot_purchased",
    ]);
  });

  it("filters out expired lots from consumption order", () => {
    const expiredLot = createLot("lot_expired", "promotional", "10.00", new Date("2025-12-31T00:00:00Z"));
    const validLot = createLot("lot_valid", "purchased", "50.00", null);

    const ordered = consumptionOrder([expiredLot, validLot], new Date("2026-01-01T00:00:00Z"));
    expect(ordered.length).toBe(1);
    expect(ordered[0]?.id).toBe("lot_valid");
  });

  it("allocates credit lots across multiple lots deterministically", () => {
    const lotA = createLot("lot_a", "promotional", "15.00", new Date("2027-04-01T00:00:00Z"));
    const lotB = createLot("lot_b", "purchased", "50.00", null);

    const result = allocateCreditLots([lotA, lotB], new Decimal("20.00"), "res_100", new Date("2026-01-01T00:00:00Z"));

    expect(result.allocations.length).toBe(2);
    // Takes all 15.00 from lotA
    expect(result.allocations[0]?.creditLotId).toBe("lot_a");
    expect(result.allocations[0]?.allocatedAmount.toString()).toBe("15");

    // Takes remaining 5.00 from lotB
    expect(result.allocations[1]?.creditLotId).toBe("lot_b");
    expect(result.allocations[1]?.allocatedAmount.toString()).toBe("5");

    // Check updated lots
    const updatedA = result.updatedLots.find((l) => l.id === "lot_a")!;
    const updatedB = result.updatedLots.find((l) => l.id === "lot_b")!;
    expect(updatedA.reservedAmount.toString()).toBe("15");
    expect(updatedB.reservedAmount.toString()).toBe("5");
  });

  it("throws insufficient_credits error when available credits are lower than required", () => {
    const lot = createLot("lot_1", "trial", "5.00", null);

    expect(() => allocateCreditLots([lot], new Decimal("10.00"), "res_fail")).toThrowError(
      /Insufficient credits/
    );
  });

  it("calculates balance projections correctly from credit lots", () => {
    const lot1 = createLot("lot_1", "purchased", "100.00", null);
    lot1.reservedAmount = new Decimal("25.00");

    const lot2 = createLot("lot_2", "promotional", "50.00", new Date("2026-12-31T00:00:00Z"));
    lot2.reservedAmount = new Decimal("10.00");

    const proj = calculateBalanceFromLots([lot1, lot2]);
    // Total: 100 + 50 = 150
    // Reserved: 25 + 10 = 35
    // Available: 150 - 35 = 115
    expect(proj.total.toString()).toBe("150");
    expect(proj.reserved.toString()).toBe("35");
    expect(proj.available.toString()).toBe("115");
  });

  it("rebuilds balance faithfully from immutable ledger entries", () => {
    const entries: WalletLedgerEntry[] = [
      {
        id: "led_1",
        walletId: "wal_1",
        organizationId: "org_1",
        currency: "USD",
        sequence: 1n,
        entryType: "credit_grant",
        amount: new Decimal("100.00"),
        direction: "credit",
        referenceType: "grant",
        referenceId: "grt_1",
        createdAt: new Date("2026-01-01T00:00:00Z"),
      },
      {
        id: "led_2",
        walletId: "wal_1",
        organizationId: "org_1",
        currency: "USD",
        sequence: 2n,
        entryType: "reservation",
        amount: new Decimal("20.00"),
        direction: "debit",
        referenceType: "reservation",
        referenceId: "res_1",
        createdAt: new Date("2026-01-01T00:01:00Z"),
      },
      {
        id: "led_3",
        walletId: "wal_1",
        organizationId: "org_1",
        currency: "USD",
        sequence: 3n,
        entryType: "usage_settlement",
        amount: new Decimal("15.00"),
        direction: "debit",
        referenceType: "settlement",
        referenceId: "res_1",
        createdAt: new Date("2026-01-01T00:02:00Z"),
      },
      {
        id: "led_4",
        walletId: "wal_1",
        organizationId: "org_1",
        currency: "USD",
        sequence: 4n,
        entryType: "reservation_release",
        amount: new Decimal("5.00"),
        direction: "credit",
        referenceType: "settlement",
        referenceId: "res_1",
        createdAt: new Date("2026-01-01T00:02:00Z"),
      },
    ];

    const balance = calculateBalanceFromLedger(entries, "wal_1");
    // Grant: total=100, avail=100, res=0
    // Reservation: total=100, avail=80, res=20
    // Settlement: total=85, avail=80, res=5
    // Release: total=85, avail=85, res=0
    expect(balance.total.toString()).toBe("85");
    expect(balance.reserved.toString()).toBe("0");
    expect(balance.available.toString()).toBe("85");
    expect(balance.version).toBe(4);
  });

  it("verifies balance integrity and detects discrepancies", () => {
    const materialized = {
      walletId: "wal_1",
      total: new Decimal("100.00"),
      reserved: new Decimal("20.00"),
      available: new Decimal("80.00"),
      version: 5,
      updatedAt: new Date(),
    };

    const calculatedExact = {
      total: new Decimal("100.00"),
      reserved: new Decimal("20.00"),
      available: new Decimal("80.00"),
    };

    const check1 = verifyBalanceIntegrity(materialized, calculatedExact);
    expect(check1.matches).toBe(true);
    expect(check1.discrepancies.length).toBe(0);

    const calculatedMismatch = {
      total: new Decimal("105.00"),
      reserved: new Decimal("20.00"),
      available: new Decimal("85.00"),
    };

    const check2 = verifyBalanceIntegrity(materialized, calculatedMismatch);
    expect(check2.matches).toBe(false);
    expect(check2.discrepancies.length).toBe(2);
  });
});
