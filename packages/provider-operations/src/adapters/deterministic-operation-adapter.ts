import type {
  ProviderOperationAdapter,
  ProviderOperationStatusResult,
  ProviderOperationCancelResult,
  ProviderOperationResultData,
} from "./provider-operation-adapter.js";

export class DeterministicOperationAdapter implements ProviderOperationAdapter {
  public readonly providerId = "deterministic";
  public mockStatus: ProviderOperationStatusResult = {
    status: "completed",
    progress: 100,
    resultReference: "mock_output_reference_123",
    usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
  };

  public async getOperationStatus(
    _providerOperationId: string,
    _credentials?: unknown
  ): Promise<ProviderOperationStatusResult> {
    return { ...this.mockStatus };
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
        id: resultReference,
        status: "succeeded",
        output: "Deterministic simulated async result payload",
      },
      outputFileMime: "application/json",
    };
  }

  public parseCallback(
    payload: Record<string, unknown>,
    _headers: Record<string, string>
  ) {
    return {
      providerOperationId: (payload.providerOperationId as string) || "mock_pop_123",
      status: (payload.status as any) || "completed",
      resultReference: "mock_callback_result_ref",
    };
  }

  public supportsCallbacks(): boolean {
    return true;
  }

  public supportsCancellation(): boolean {
    return true;
  }
}
