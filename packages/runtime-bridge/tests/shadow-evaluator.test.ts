import { describe, it, expect } from "vitest";
import { ShadowEvaluator } from "../src/shadow-evaluator.js";
import type { RuntimeExecutionResult } from "@growx/contracts";

describe("ShadowEvaluator", () => {
  const baseResult: RuntimeExecutionResult = {
    id: "req_123",
    runtime: "typescript",
    status: "success",
    content: "Hello World",
    inputTokens: 10,
    outputTokens: 5,
    durationMs: 15,
  };

  it("reports matching parity when primary and shadow results align", () => {
    const shadowResult: RuntimeExecutionResult = {
      ...baseResult,
      runtime: "go_runtime",
      durationMs: 4, // Latency can differ
    };

    const comparison = ShadowEvaluator.compareResults(baseResult, shadowResult);
    expect(comparison.matches).toBe(true);
    expect(comparison.mismatchType).toBe("none");
  });

  it("detects payload mismatch when output content differs", () => {
    const shadowResult: RuntimeExecutionResult = {
      ...baseResult,
      runtime: "go_runtime",
      content: "Different Output Text",
    };

    const comparison = ShadowEvaluator.compareResults(baseResult, shadowResult);
    expect(comparison.matches).toBe(false);
    expect(comparison.mismatchType).toBe("payload");
  });

  it("detects error code mismatch", () => {
    const errResult: RuntimeExecutionResult = {
      ...baseResult,
      status: "error",
      errorCode: "model_not_found",
    };
    const shadowErrResult: RuntimeExecutionResult = {
      ...baseResult,
      status: "error",
      errorCode: "provider_timeout",
    };

    const comparison = ShadowEvaluator.compareResults(
      errResult,
      shadowErrResult,
    );
    expect(comparison.matches).toBe(false);
    expect(comparison.mismatchType).toBe("error_code");
  });
});
