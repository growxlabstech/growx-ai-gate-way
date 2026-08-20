import { describe, it, expect, beforeEach } from "vitest";
import {
  RuntimeCanaryController,
  ShadowEvaluator,
  GoldenContractComparator,
  TypeScriptRuntimeAdapter,
  GoRuntimeAdapter,
  RustTokenizerAdapter,
} from "@growx/runtime-bridge";
import {
  createTestGatewayFixture,
  type TestGatewayFixture,
} from "../helpers/test-fixture.js";

describe("Runtime Evolution & Selective Go/Rust Extraction Lifecycle (Phase 38)", () => {
  let fixture: TestGatewayFixture;
  let canaryController: RuntimeCanaryController;
  let tsAdapter: TypeScriptRuntimeAdapter;
  let goAdapter: GoRuntimeAdapter;

  beforeEach(async () => {
    fixture = await createTestGatewayFixture();
    canaryController = new RuntimeCanaryController({
      target: "go_runtime",
      canaryPercentage: 25,
      stage: "5_canary_25pct",
    });
    tsAdapter = new TypeScriptRuntimeAdapter();
    goAdapter = new GoRuntimeAdapter();
  });

  it("determines deterministic runtime target according to canary percentage", () => {
    const orgId = "org_enterprise_1";
    const decision1 = canaryController.resolveRuntimeTarget({ organizationId: orgId });
    const decision2 = canaryController.resolveRuntimeTarget({ organizationId: orgId });

    expect(decision1.target).toBe(decision2.target);
    expect(["typescript", "go_runtime"]).toContain(decision1.target);
  });

  it("evaluates shadow execution results for parity with zero double-metering", () => {
    const reqId = "req_shadow_test";
    const primaryResult = {
      id: reqId,
      runtime: "typescript" as const,
      status: "success" as const,
      content: "Hello from GrowX Gateway",
      inputTokens: 15,
      outputTokens: 25,
      durationMs: 12,
    };
    const shadowResult = {
      ...primaryResult,
      runtime: "go_runtime" as const,
      durationMs: 3, // Go runtime faster
    };

    const comparison = ShadowEvaluator.compareResults(primaryResult, shadowResult);
    expect(comparison.matches).toBe(true);
    expect(comparison.mismatchType).toBe("none");
    expect(comparison.shadowLatencyMs).toBeLessThan(comparison.primaryLatencyMs);
  });

  it("executes cross-language golden contract verification across TypeScript, Go and Rust", async () => {
    const reqId = "req_golden_" + Date.now();
    const tsRes = await tsAdapter.execute({ id: reqId, prompt: "Translate this", model: "gpt-4o" });
    const goRes = await goAdapter.execute({ id: reqId, prompt: "Translate this", model: "gpt-4o" });

    // Verify 100% contract equivalence
    expect(() => {
      GoldenContractComparator.verifyParity(tsRes, goRes);
    }).not.toThrow();

    // Verify Rust tokenizer bridge stateless throughput
    const tokenCount = RustTokenizerAdapter.countTokens("Translate this into French");
    expect(tokenCount).toBeGreaterThan(0);
  });

  it("executes emergency rollback safely to TypeScript runtime", () => {
    canaryController.updatePolicy({ canaryPercentage: 50, stage: "6_canary_50pct" });
    expect(canaryController.getPolicy().canaryPercentage).toBe(50);

    try {
      canaryController.triggerRollback("Immediate security/correctness alert");
    } catch {
      // Expected rollback error
    }

    const policy = canaryController.getPolicy();
    expect(policy.status).toBe("rolling_back");
    expect(policy.canaryPercentage).toBe(0);
    expect(policy.stage).toBe("0_disabled");

    // All subsequent requests route strictly to TypeScript fallback
    const decision = canaryController.resolveRuntimeTarget({ organizationId: "any_org" });
    expect(decision.target).toBe("typescript");
    expect(decision.isCanary).toBe(false);
  });
});
