import type { PlatformOperationalMode, IncidentSeverity } from "@growx/contracts";

export class ReliabilityError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = "ReliabilityError";
  }
}

export class DependencyUnavailableError extends ReliabilityError {
  constructor(public dependencyName: string, message: string) {
    super("DEPENDENCY_UNAVAILABLE", `Critical dependency '${dependencyName}' is unavailable: ${message}`);
    this.name = "DependencyUnavailableError";
  }
}

export class CapabilityDisabledError extends ReliabilityError {
  constructor(public capability: string, public mode: PlatformOperationalMode) {
    super(
      "CAPABILITY_DISABLED",
      `Capability '${capability}' is disabled under platform mode '${mode}'`
    );
    this.name = "CapabilityDisabledError";
  }
}

export class RestoreVerificationFailedError extends ReliabilityError {
  constructor(public runId: string, public failedChecks: string[]) {
    super(
      "RESTORE_VERIFICATION_FAILED",
      `Restore drill '${runId}' failed critical invariant checks: ${failedChecks.join(", ")}`
    );
    this.name = "RestoreVerificationFailedError";
  }
}

export class InvariantViolationError extends ReliabilityError {
  constructor(public checkName: string, details: string) {
    super("INVARIANT_VIOLATION", `Invariant check '${checkName}' failed: ${details}`);
    this.name = "InvariantViolationError";
  }
}
