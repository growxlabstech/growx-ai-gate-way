import { describe, it, expect } from "vitest";
import {
  ReleaseOrchestrator,
  SmokeValidator,
  DeploymentLockError,
} from "../src/index.js";

describe("ReleaseOrchestrator & SmokeValidator", () => {
  it("executes synthetic smoke suite with zero customer billing contamination", async () => {
    const smokeResults = await SmokeValidator.executeSmokeSuite();
    expect(smokeResults.length).toBeGreaterThanOrEqual(5);

    for (const res of smokeResults) {
      expect(res.status).toBe("passed");
      expect(res.isSynthetic).toBe(true);
    }
  });

  it("orchestrates a full release lifecycle and prevents concurrent release locks", async () => {
    const orchestrator = new ReleaseOrchestrator();
    const release = await orchestrator.initiateRelease({
      version: "1.4.0",
      gitSha: "a1b2c3d4",
      environment: "staging",
    });

    expect(release.id).toBeDefined();
    expect(release.status).toBe("deployed");
    expect(release.smokeResults.length).toBeGreaterThan(0);

    // Rollback validation
    const rolledBack = orchestrator.rollbackRelease(
      release.id,
      "Staging validation failure",
    );
    expect(rolledBack.status).toBe("rolled_back");
    expect(rolledBack.rollbackReason).toBe("Staging validation failure");
  });
});
