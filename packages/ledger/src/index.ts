import type { Currency } from "@growx/money";
export type LedgerAccountType =
  "asset" | "liability" | "revenue" | "expense" | "equity";
export interface LedgerEntry {
  id: string;
  accountId: string;
  direction: "debit" | "credit";
  amountMinor: bigint;
  currency: Currency;
  creditAmount?: bigint;
  metadata?: Readonly<Record<string, string>>;
}
export interface LedgerTransaction {
  id: string;
  transactionType: string;
  referenceType: string;
  referenceId: string;
  organizationId: string | null;
  currency: Currency;
  status: "posted" | "reversed";
  occurredAt: Date;
  entries: readonly LedgerEntry[];
  reversalOf?: string;
}
export function assertBalanced(transaction: LedgerTransaction): void {
  if (
    transaction.entries.some(
      (entry) =>
        entry.amountMinor < 0n || entry.currency !== transaction.currency,
    )
  )
    throw new Error(
      "Ledger entries require non-negative amounts in transaction currency",
    );
  const debit = transaction.entries
    .filter((entry) => entry.direction === "debit")
    .reduce((sum, entry) => sum + entry.amountMinor, 0n);
  const credit = transaction.entries
    .filter((entry) => entry.direction === "credit")
    .reduce((sum, entry) => sum + entry.amountMinor, 0n);
  if (debit !== credit)
    throw Object.assign(
      new Error(
        `Unbalanced ledger transaction: debit=${debit} credit=${credit}`,
      ),
      { code: "unbalanced_ledger" },
    );
}
export function reverseTransaction(
  original: LedgerTransaction,
  id: string,
  occurredAt = new Date(),
): LedgerTransaction {
  const reversal = {
    ...original,
    id,
    status: "reversed" as const,
    occurredAt,
    reversalOf: original.id,
    entries: original.entries.map((entry) => ({
      ...entry,
      id: `${entry.id}_reversal`,
      direction:
        entry.direction === "debit" ? ("credit" as const) : ("debit" as const),
    })),
  };
  assertBalanced(reversal);
  return reversal;
}
export interface AppendOnlyLedger {
  append(transaction: LedgerTransaction): Promise<void>;
  find(transactionId: string): Promise<LedgerTransaction | null>;
}
export async function post(
  ledger: AppendOnlyLedger,
  transaction: LedgerTransaction,
) {
  assertBalanced(transaction);
  if (await ledger.find(transaction.id))
    throw Object.assign(new Error("Duplicate ledger transaction"), {
      code: "duplicate_ledger_transaction",
    });
  await ledger.append(transaction);
}
