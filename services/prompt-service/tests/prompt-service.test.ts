import { describe, it, expect } from "vitest";
import { InMemoryPromptRepository } from "../src/infrastructure/in-memory-repository.js";
import { InMemoryPromptEvents } from "../src/infrastructure/events.js";
import { PromptService } from "../src/application/prompt-service.js";
import { PromptValidationError, PromptNotFoundError } from "@growx/prompts";

describe("PromptService Lifecycle & Multi-Tenancy", () => {
  const repo = new InMemoryPromptRepository();
  const events = new InMemoryPromptEvents();
  const service = new PromptService(repo, events);

  it("creates prompt definition and enforces scoped uniqueness", async () => {
    const { prompt } = await service.createPrompt(
      "org_1",
      undefined,
      {
        key: "support.classifier",
        name: "Support Ticket Classifier",
        description: "Classifies incoming customer support tickets",
        type: "classification",
        visibility: "organization",
      },
      "usr_1"
    );

    expect(prompt.id).toBeDefined();
    expect(prompt.key).toBe("support.classifier");

    // Reject duplicate key in same organization
    await expect(
      service.createPrompt(
        "org_1",
        undefined,
        {
          key: "support.classifier",
          name: "Duplicate Classifier",
        },
        "usr_1"
      )
    ).rejects.toThrowError(PromptValidationError);

    // Allow same key in another organization
    const org2Prompt = await service.createPrompt(
      "org_2",
      undefined,
      {
        key: "support.classifier",
        name: "Org 2 Classifier",
      },
      "usr_2"
    );
    expect(org2Prompt.prompt.organizationId).toBe("org_2");
  });

  it("creates immutable monotonic versions with content hashing", async () => {
    const { prompt } = await service.createPrompt(
      "org_1",
      undefined,
      {
        key: "invoice.extractor",
        name: "Invoice Extractor",
      },
      "usr_1"
    );

    // 1. Create Version 1
    const v1 = await service.createVersion(
      "org_1",
      prompt.id,
      {
        messages: [{ role: "user", contentTemplate: "Extract invoice details: {{raw_text}}" }],
        variableSchema: [{ name: "raw_text", type: "string", required: true }],
      },
      "usr_1"
    );

    expect(v1.version).toBe(1);
    expect(v1.contentHash).toBeDefined();

    // 2. Create Version 2
    const v2 = await service.createVersion(
      "org_1",
      prompt.id,
      {
        messages: [
          { role: "system", contentTemplate: "You are an accurate accounting assistant." },
          { role: "user", contentTemplate: "Extract invoice details: {{raw_text}}" },
        ],
        variableSchema: [{ name: "raw_text", type: "string", required: true }],
        requiredCapabilities: ["structured_output"],
      },
      "usr_1"
    );

    expect(v2.version).toBe(2);
    expect(v2.contentHash).not.toBe(v1.contentHash);

    const versions = await service.listVersions("org_1", prompt.id);
    expect(versions.length).toBe(2);
  });

  it("manages environment releases and instant rollback", async () => {
    const { prompt } = await service.createPrompt(
      "org_1",
      undefined,
      {
        key: "summary.generator",
        name: "Summary Generator",
      },
      "usr_1"
    );

    const v1 = await service.createVersion(
      "org_1",
      prompt.id,
      {
        messages: [{ role: "user", contentTemplate: "Summarize: {{text}}" }],
        variableSchema: [{ name: "text", type: "string", required: true }],
      },
      "usr_1"
    );

    const v2 = await service.createVersion(
      "org_1",
      prompt.id,
      {
        messages: [{ role: "user", contentTemplate: "Provide a 3-bullet summary of: {{text}}" }],
        variableSchema: [{ name: "text", type: "string", required: true }],
      },
      "usr_1"
    );

    // 1. Release V1 to Production
    const rel1 = await service.createRelease(
      "org_1",
      prompt.id,
      {
        promptVersionId: v1.id,
        environment: "production",
        notes: "Initial v1 release",
      },
      "usr_1",
      true
    );

    expect(rel1.releaseNumber).toBe(1);
    expect(rel1.promptVersionId).toBe(v1.id);

    // 2. Release V2 to Production (promotion)
    const rel2 = await service.createRelease(
      "org_1",
      prompt.id,
      {
        promptVersionId: v2.id,
        environment: "production",
        notes: "Upgrade to 3-bullet summary",
      },
      "usr_1",
      true
    );

    expect(rel2.releaseNumber).toBe(2);
    expect(rel2.promptVersionId).toBe(v2.id);

    // 3. Rollback to V1
    const rollbackRel = await service.rollbackRelease(
      "org_1",
      prompt.id,
      {
        environment: "production",
        reason: "Regression detected in v2 bullet formatting",
      },
      "usr_1",
      true
    );

    expect(rollbackRel.releaseNumber).toBe(3);
    expect(rollbackRel.promptVersionId).toBe(v1.id);
    expect(rollbackRel.rollbackFromReleaseId).toBe(rel2.id);
  });

  it("enforces tenant isolation across all prompt operations", async () => {
    const { prompt } = await service.createPrompt(
      "org_tenant_a",
      undefined,
      {
        key: "secret.prompt",
        name: "Tenant A Secret Prompt",
      },
      "usr_a"
    );

    // Tenant B cannot get or mutate Tenant A prompt
    await expect(service.getPrompt("org_tenant_b", prompt.id)).rejects.toThrowError(PromptNotFoundError);
    await expect(
      service.createVersion(
        "org_tenant_b",
        prompt.id,
        {
          messages: [{ role: "user", contentTemplate: "Hijack" }],
          variableSchema: [],
        },
        "usr_b"
      )
    ).rejects.toThrowError(PromptNotFoundError);
  });
});
