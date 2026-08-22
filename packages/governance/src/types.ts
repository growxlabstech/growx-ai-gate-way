import type { DataCategory, DataClass, DeletionStatus } from "@growx/contracts";

export class GovernancePolicyError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "GovernancePolicyError";
  }
}

export class DataResidencyViolationError extends GovernancePolicyError {
  constructor(
    public requiredRegion: string,
    public routeRegion: string,
  ) {
    super(
      "DATA_RESIDENCY_VIOLATION",
      `Data residency violation: required '${requiredRegion}', but route is in '${routeRegion}'`,
    );
    this.name = "DataResidencyViolationError";
  }
}

export class RetentionHoldActiveError extends GovernancePolicyError {
  constructor(
    public holdId: string,
    public reason: string,
  ) {
    super(
      "RETENTION_HOLD_ACTIVE",
      `Cannot delete resource: active retention hold '${holdId}' (${reason})`,
    );
    this.name = "RetentionHoldActiveError";
  }
}

export class DeletionProcessorError extends GovernancePolicyError {
  constructor(
    public processor: string,
    message: string,
  ) {
    super(
      "DELETION_PROCESSOR_FAILED",
      `Deletion processor '${processor}' failed: ${message}`,
    );
    this.name = "DeletionProcessorError";
  }
}

export class UnauthorizedExportError extends GovernancePolicyError {
  constructor(message: string) {
    super("UNAUTHORIZED_EXPORT", message);
    this.name = "UnauthorizedExportError";
  }
}
