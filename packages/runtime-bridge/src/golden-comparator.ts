import type { RuntimeExecutionResult } from "@growx/contracts";
import { ContractMismatchError } from "./types.js";

export class GoldenContractComparator {
  public static verifyParity(
    baseline: RuntimeExecutionResult,
    candidate: RuntimeExecutionResult,
  ): void {
    if (baseline.status !== candidate.status) {
      throw new ContractMismatchError(
        "status",
        `Baseline status '${baseline.status}' !== Candidate status '${candidate.status}'`,
      );
    }

    if (baseline.errorCode !== candidate.errorCode) {
      throw new ContractMismatchError(
        "error_code",
        `Baseline error '${baseline.errorCode}' !== Candidate error '${candidate.errorCode}'`,
      );
    }

    if (baseline.content !== candidate.content) {
      throw new ContractMismatchError(
        "content",
        "Baseline content does not match candidate content",
      );
    }

    if (
      baseline.inputTokens !== candidate.inputTokens ||
      baseline.outputTokens !== candidate.outputTokens
    ) {
      throw new ContractMismatchError(
        "token_count",
        `Token accounting mismatch: baseline (${baseline.inputTokens}/${baseline.outputTokens}) vs candidate (${candidate.inputTokens}/${candidate.outputTokens})`,
      );
    }
  }
}
