import { describe, it, expect, beforeEach } from "vitest";
import {
  ReleaseOrchestrator,
  SmokeValidator,
} from "@growx/deployment";
import { GrowXAI } from "@growx/ai";
import { GrowXCLI } from "@growx/cli";
import {
  createTestGatewayFixture,
  type TestGatewayFixture,
} from "../helpers/test-fixture.js";

describe("Developer Platform & Production Deployment Architecture Lifecycle (Phase 39)", () => {
  let fixture: TestGatewayFixture;
  let releaseOrchestrator: ReleaseOrchestrator;

  beforeEach(async () => {
    fixture = await createTestGatewayFixture();
    releaseOrchestrator = new ReleaseOrchestrator();
  });

  it("provides ergonomic official TypeScript SDK for chat completions and models", async () => {
    const client = new GrowXAI({
      apiKey: "gx_live_test_api_key_123",
      baseURL: "https://api.growxlabs.tech",
      fetch: async () =>
        new Response(
          JSON.stringify({
            id: "chatcmpl_test123",
            choices: [{ message: { role: "assistant", content: "Paris is the capital of France." }, finish_reason: "stop" }],
            usage: { prompt_tokens: 10, completion_tokens: 15, total_tokens: 25 },
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        ),
    });

    const res = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: "What is the capital of France?" }],
    });

    expect(res.id).toBe("chatcmpl_test123");
    expect(res.choices[0]!.message.content).toContain("Paris");
    expect(res.usage.total_tokens).toBe(25);
  });

  it("provides official CLI tool with auth and chat operations", async () => {
    const cli = new GrowXCLI("gx_live_test_cli_key");
    const res = await cli.run(["chat", "Explain quantum computing", "gpt-4o"]);

    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain("Echo: Explain quantum computing");
  });

  it("orchestrates production release with synthetic smoke validation and zero billing contamination", async () => {
    const release = await releaseOrchestrator.initiateRelease({
      version: "1.0.0",
      gitSha: "prod_git_sha_abc123",
      environment: "production",
    });

    expect(release.id).toBeDefined();
    expect(release.status).toBe("deployed");
    expect(release.smokeResults!.length).toBeGreaterThanOrEqual(5);

    // Verify all smoke validation runs are flagged as synthetic
    for (const test of release.smokeResults!) {
      expect(test.status).toBe("passed");
      expect(test.isSynthetic).toBe(true);
    }
  });

  it("executes safe emergency deployment rollback with documented reason", () => {
    const orchestrator = new ReleaseOrchestrator();
    // Simulate active deployed release
    orchestrator.initiateRelease({
      version: "1.0.1",
      gitSha: "prod_git_sha_def456",
      environment: "production",
    }).then((rel) => {
      const rolledBack = orchestrator.rollbackRelease(rel.id, "High error rate detected in upstream canary");
      expect(rolledBack.status).toBe("rolled_back");
      expect(rolledBack.rollbackReason).toContain("High error rate");
    });
  });
});
