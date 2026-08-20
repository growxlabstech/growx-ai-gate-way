import type {
  ProviderOperationAdapter,
  ProviderOperationStatusResult,
  ProviderOperationCancelResult,
  ProviderOperationResultData,
} from "./provider-operation-adapter.js";
import type { ProviderOperationStatus } from "@growx/contracts";

export class GeminiOperationAdapter implements ProviderOperationAdapter {
  public readonly providerId = "google";

  public async getOperationStatus(
    providerOperationId: string,
    _credentials?: unknown
  ): Promise<ProviderOperationStatusResult> {
    return {
      status: "running",
      progress: 75,
      resultReference: `gemini_res_${providerOperationId}`,
    };
  }

  public async cancelOperation(
    _providerOperationId: string,
    _credentials?: unknown
  ): Promise<ProviderOperationCancelResult> {
    return {
      cancelled: true,
      status: "cancelled",
    };
  }

  public async fetchResult(
    resultReference: string,
    _credentials?: unknown
  ): Promise<ProviderOperationResultData> {
    return {
      data: { result: "Gemini async operation completed successfully", ref: resultReference },
      outputFileMime: "application/json",
    };
  }

  public parseCallback(
    payload: Record<string, unknown>,
    _headers: Record<string, string>
  ): {
    providerOperationId: string;
    status: ProviderOperationStatus;
    errorCode?: string;
    errorMessage?: string;
    resultReference?: string;
  } {
    const isDone = payload.done === true;
    const hasError = !!payload.error;
    const status: ProviderOperationStatus = hasError ? "failed" : isDone ? "completed" : "running";

    return {
      providerOperationId: (payload.name as string) || "unknown_gemini_op",
      status,
      resultReference: isDone ? (payload.name as string) : undefined,
    };
  }

  public supportsCallbacks(): boolean {
    return false;
  }

  public supportsCancellation(): boolean {
    return true;
  }
}
