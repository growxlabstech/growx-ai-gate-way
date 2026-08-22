import type { ProviderOperationStatus } from "@growx/contracts";

export class ProviderOperationError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "ProviderOperationError";
  }
}

export class InvalidStateTransitionError extends ProviderOperationError {
  constructor(
    public from: ProviderOperationStatus,
    public to: ProviderOperationStatus,
  ) {
    super(
      "INVALID_STATE_TRANSITION",
      `Cannot transition provider operation from '${from}' to '${to}'`,
    );
    this.name = "InvalidStateTransitionError";
  }
}

export class CallbackAuthError extends ProviderOperationError {
  constructor(message: string) {
    super("CALLBACK_AUTH_FAILED", message);
    this.name = "CallbackAuthError";
  }
}

export class CancellationNotSupportedError extends ProviderOperationError {
  constructor(public providerId: string) {
    super(
      "CANCELLATION_NOT_SUPPORTED",
      `Provider '${providerId}' does not support operation cancellation`,
    );
    this.name = "CancellationNotSupportedError";
  }
}

export class AmbiguousSubmissionError extends ProviderOperationError {
  constructor(public providerOperationId?: string) {
    super(
      "AMBIGUOUS_SUBMISSION",
      "Provider operation acceptance status is ambiguous",
    );
    this.name = "AmbiguousSubmissionError";
  }
}

export class LeaseAcquisitionError extends ProviderOperationError {
  constructor(public operationId: string) {
    super(
      "LEASE_ACQUISITION_FAILED",
      `Failed to acquire polling lease for operation '${operationId}'`,
    );
    this.name = "LeaseAcquisitionError";
  }
}
