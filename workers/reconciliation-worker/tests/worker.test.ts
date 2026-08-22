import { describe, expect, it } from "vitest";
import { runDailyReconciliation } from "../src/index.js";
describe("reconciliation worker", () => {
  it("runs every financial domain", async () => {
    let count = 0;
    expect(
      await runDailyReconciliation({
        async run() {
          count++;
          return { mismatches: 1 };
        },
      }),
    ).toBe(4);
    expect(count).toBe(4);
  });
});
