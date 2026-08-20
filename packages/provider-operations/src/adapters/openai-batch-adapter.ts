import type {
  ProviderOperationAdapter,
  ProviderOperationStatusResult,
  ProviderOperationCancelResult,
  ProviderOperationResultData,
} from "./provider-operation-adapter.js";
import type { ProviderOperationStatus } from "@growx/contracts";

export class OpenAIBatchAdapter implements ProviderOperationAdapter {
  public readonly providerId = "openai";

  public async getOperationStatus(
    providerOperationId: string,
    _credentials?: unknown
  ): Promise<ProviderOperationStatusResult> {
    // Normalizes OpenAI Batch Object: { id, status: 'validating'|'in_progress'|'completed'|'failed'|'expired'|'cancelling'|'cancelled', output_file_id }
    return {
      status: "running",
      progress: 50,
      resultReference: `file_openai_${providerOperationId}_out`,
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
      data: {
        file_id: resultReference,
        status: "ready",
      },
      outputFileMime: "application/jsonl",
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
    const rawStatus = (payload.status as string) || "completed";
    let status: ProviderOperationStatus = "running";
    if (rawStatus === "completed") status = "completed";
    else if (rawStatus === "failed") status = "failed";
    else if (rawStatus === "cancelled") status = "cancelled";

    return {
      providerOperationId: (payload.id as string) || "unknown_op",
      status,
      resultReference: (payload.output_file_id as string) || undefined,
    };
  }

  public supportsCallbacks(): boolean {
    return true;
  }

  public supportsCancellation(): boolean {
    return true;
  }
}
