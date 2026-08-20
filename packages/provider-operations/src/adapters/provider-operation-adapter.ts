import type { ProviderOperationStatus } from "@growx/contracts";

export interface ProviderOperationStatusResult {
  status: ProviderOperationStatus;
  progress?: number;
  errorCode?: string;
  errorMessage?: string;
  resultReference?: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    units?: number;
  };
}

export interface ProviderOperationCancelResult {
  cancelled: boolean;
  status: ProviderOperationStatus;
}

export interface ProviderOperationResultData {
  data: unknown;
  rawBuffer?: Buffer;
  outputFileMime?: string;
}

export interface ProviderOperationAdapter {
  readonly providerId: string;

  getOperationStatus(
    providerOperationId: string,
    credentials?: unknown
  ): Promise<ProviderOperationStatusResult>;

  cancelOperation?(
    providerOperationId: string,
    credentials?: unknown
  ): Promise<ProviderOperationCancelResult>;

  fetchResult(
    resultReference: string,
    credentials?: unknown
  ): Promise<ProviderOperationResultData>;

  parseCallback?(
    payload: Record<string, unknown>,
    headers: Record<string, string>
  ): {
    providerOperationId: string;
    status: ProviderOperationStatus;
    errorCode?: string;
    errorMessage?: string;
    resultReference?: string;
  };

  supportsCallbacks(): boolean;
  supportsCancellation(): boolean;
}
