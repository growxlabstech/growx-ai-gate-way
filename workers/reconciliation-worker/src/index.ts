export interface ReconciliationRunner {
  run(
    kind: "provider" | "payment" | "credit" | "ledger",
    date: Date,
  ): Promise<{ mismatches: number }>;
}
export async function runDailyReconciliation(
  runner: ReconciliationRunner,
  date = new Date(),
) {
  const results = await Promise.all(
    (["provider", "payment", "credit", "ledger"] as const).map((kind) =>
      runner.run(kind, date),
    ),
  );
  return results.reduce((sum, value) => sum + value.mismatches, 0);
}
