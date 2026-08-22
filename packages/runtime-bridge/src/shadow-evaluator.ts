import type {
  RuntimeExecutionResult,
  ShadowComparisonResult,
} from "@growx/contracts";

export class ShadowEvaluator {
  public static compareResults(
    primary: RuntimeExecutionResult,
    shadow: RuntimeExecutionResult,
  ): ShadowComparisonResult {
    let matches = true;
    let mismatchType: ShadowComparisonResult["mismatchType"] = "none";
    let details: string | undefined;

    // 1. Verify Error Code Parity
    if (
      primary.status !== shadow.status ||
      primary.errorCode !== shadow.errorCode
    ) {
      matches = false;
      mismatchType = "error_code";
      details = `Primary status '${primary.status}' vs Shadow status '${shadow.status}' (error: '${primary.errorCode}' vs '${shadow.errorCode}')`;
    }
    // 2. Verify Output Content Parity
    else if (primary.content !== shadow.content) {
      matches = false;
      mismatchType = "payload";
      details = "Output text payload mismatch between runtimes";
    }
    // 3. Verify Token Count Parity
    else if (
      primary.inputTokens !== shadow.inputTokens ||
      primary.outputTokens !== shadow.outputTokens
    ) {
      matches = false;
      mismatchType = "token_count";
      details = `Tokens: primary (${primary.inputTokens}/${primary.outputTokens}) vs shadow (${shadow.inputTokens}/${shadow.outputTokens})`;
    }

    return {
      requestId: primary.id,
      primaryTarget: primary.runtime,
      shadowTarget: shadow.runtime,
      matches,
      mismatchType,
      details,
      primaryLatencyMs: primary.durationMs,
      shadowLatencyMs: shadow.durationMs,
      primaryTokenCount: primary.inputTokens + primary.outputTokens,
      shadowTokenCount: shadow.inputTokens + shadow.outputTokens,
      evaluatedAt: new Date(),
    };
  }
}
