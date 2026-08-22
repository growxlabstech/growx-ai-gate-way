import { describe, it, expect } from "vitest";
import { GoldenContractComparator } from "../src/golden-comparator.js";
import { ContractMismatchError } from "../src/types.js";
import type { RuntimeExecutionResult } from "@growx/contracts";

describe("GoldenContractComparator", () => {
  const baseline: RuntimeExecutionResult = {
    id: "gold_1",
    runtime: "typescript",
    status: "success",
    content: "Structured response",
    inputTokens: 20,
    outputTokens: 30,
    durationMs: 10,
  };

  it("passes when candidate matches baseline contract exactly", () => {
    const candidate: RuntimeExecutionResult = {
      ...baseline,
      runtime: "go_runtime",
      durationMs: 2,
    };

    expect(() => {
      GoldenContractComparator.verifyParity(baseline, candidate);
    }).not.toThrow();
  });

  it("throws ContractMismatchError when token count differs", () => {
    const candidate: RuntimeExecutionResult = {
      ...baseline,
      runtime: "go_runtime",
      outputTokens: 35,
    };

    expect(() => {
      GoldenContractComparator.verifyParity(baseline, candidate);
    }).toThrow(ContractMismatchError);
  });
});
