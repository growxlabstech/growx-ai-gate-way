export class DeploymentError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "DeploymentError";
  }
}

export class DeploymentLockError extends DeploymentError {
  constructor(activeReleaseId: string) {
    super(
      "DEPLOYMENT_LOCKED",
      `Another release (${activeReleaseId}) is currently in progress`,
    );
    this.name = "DeploymentLockError";
  }
}

export class SmokeTestFailureError extends DeploymentError {
  constructor(failedTests: string[]) {
    super(
      "SMOKE_TEST_FAILED",
      `Smoke test validation failed for: ${failedTests.join(", ")}`,
    );
    this.name = "SmokeTestFailureError";
  }
}
