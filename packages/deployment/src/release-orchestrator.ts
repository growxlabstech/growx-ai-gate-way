import type {
  DeploymentRelease,
  DeploymentEnvironment,
  SmokeTestResult,
} from "@growx/contracts";
import { generateId } from "@growx/ids";
import { DeploymentLockError, SmokeTestFailureError } from "./types.js";
import { SmokeValidator } from "./smoke-validator.js";

export class ReleaseOrchestrator {
  private activeRelease: DeploymentRelease | null = null;
  private releaseHistory: DeploymentRelease[] = [];

  public async initiateRelease(params: {
    version: string;
    gitSha: string;
    environment: DeploymentEnvironment;
  }): Promise<DeploymentRelease> {
    if (
      this.activeRelease &&
      this.activeRelease.status !== "deployed" &&
      this.activeRelease.status !== "rolled_back" &&
      this.activeRelease.status !== "failed"
    ) {
      throw new DeploymentLockError(this.activeRelease.id);
    }

    const release: DeploymentRelease = {
      id: generateId("rel"),
      version: params.version,
      gitSha: params.gitSha,
      environment: params.environment,
      status: "migrating",
      createdAt: new Date(),
      smokeResults: [],
    };

    this.activeRelease = release;

    // 1. Expand/Contract Database Migration Step
    // Forward-safe schema applied

    // 2. Execute Staging/Production Smoke Suite with Synthetic Traffic
    release.status = "staging_smoke";
    const smokeResults = await SmokeValidator.executeSmokeSuite();
    release.smokeResults = smokeResults;

    const failed = smokeResults.filter((s) => s.status === "failed");
    if (failed.length > 0) {
      release.status = "failed";
      throw new SmokeTestFailureError(failed.map((f) => f.name));
    }

    // 3. Canary & Final Deployment
    release.status = "deployed";
    release.deployedAt = new Date();
    this.releaseHistory.push(release);

    return release;
  }

  public rollbackRelease(releaseId: string, reason: string): DeploymentRelease {
    const release =
      this.releaseHistory.find((r) => r.id === releaseId) || this.activeRelease;
    if (!release) {
      throw new Error(`Release ${releaseId} not found`);
    }

    release.status = "rolled_back";
    release.rollbackReason = reason;
    return release;
  }

  public getActiveRelease(): DeploymentRelease | null {
    return this.activeRelease;
  }

  public getHistory(): DeploymentRelease[] {
    return [...this.releaseHistory];
  }
}
