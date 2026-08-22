import { describe, expect, it } from "vitest";
import {
  assertBalanced,
  reverseTransaction,
  type LedgerTransaction,
} from "./index.js";
const transaction: LedgerTransaction = {
  id: "l",
  transactionType: "credit_purchase",
  referenceType: "payment",
  referenceId: "p",
  organizationId: "o",
  currency: "USD",
  status: "posted",
  occurredAt: new Date(),
  entries: [
    {
      id: "1",
      accountId: "cash",
      direction: "debit",
      amountMinor: 100n,
      currency: "USD",
    },
    {
      id: "2",
      accountId: "liability",
      direction: "credit",
      amountMinor: 100n,
      currency: "USD",
    },
  ],
};
describe("ledger", () => {
  it("balances every transaction", () =>
    expect(() => assertBalanced(transaction)).not.toThrow());
  it("rejects imbalance", () =>
    expect(() =>
      assertBalanced({
        ...transaction,
        entries: transaction.entries.slice(0, 1),
      }),
    ).toThrow(/Unbalanced/));
  it("creates balanced compensating reversals", () =>
    expect(() =>
      assertBalanced(reverseTransaction(transaction, "reverse")),
    ).not.toThrow());
});
