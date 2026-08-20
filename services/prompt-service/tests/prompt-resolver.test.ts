import { describe, it, expect } from "vitest";
import { InMemoryPromptRepository } from "../src/infrastructure/in-memory-repository.js";
import { InMemoryPromptEvents } from "../src/infrastructure/events.js";
import { PromptService } from "../src/application/prompt-service.js";
import { PromptResolver } from "../src/application/prompt-resolver.js";
import { PromptNotFoundError, PromptReleaseError } from "@growx/prompts";

describe("PromptResolver High-Speed Resolution & Caching", () => {
  const repo = new InMemoryPromptRepository();
  const events = new InMemoryPromptEvents();
  const resolver = new PromptResolver(repo, { ttlMs: 1000 });
  const service = new PromptService(repo, events, resolver);

  it("resolves active release with memory caching and instant invalidation on promotion", async () => {
    // Setup prompt, versions, releases
    const { prompt } = await service.createPrompt(
      "org_res",
      undefined,
      {
        key: "chat.welcome",
        name: "Welcome Bot",
      },
      "usr_1"
    );

    const v1 = await service.createVersion(
      "org_res",
      prompt.id,
      {
        messages: [{ role: "system", contentTemplate: "Welcome {{user_name}} to GrowX!" }],
        variableSchema: [{ name: "user_name", type: "string", required: true }],
      },
      "usr_1"
    );

    await service.createRelease(
      "org_res",
      prompt.id,
      {
        promptVersionId: v1.id,
        environment: "production",
      },
      "usr_1",
      true
    );

    // 1. Initial Resolution: hits DB and populates cache
    const ctx1 = await resolver.resolve("org_res", "chat.welcome", "production");
    expect(ctx1.version.id).toBe(v1.id);
    expect(ctx1.version.version).toBe(1);
    expect(ctx1.isPinnedVersion).toBe(false);

    // 2. Promote V2: automatically invalidates resolver cache
    const v2 = await service.createVersion(
      "org_res",
      prompt.id,
      {
        messages: [{ role: "system", contentTemplate: "Hello and welcome {{user_name}} to GrowX AI Gateway!" }],
        variableSchema: [{ name: "user_name", type: "string", required: true }],
      },
      "usr_1"
    );

    await service.createRelease(
      "org_res",
      prompt.id,
      {
        promptVersionId: v2.id,
        environment: "production",
      },
      "usr_1",
      true
    );

    // 3. New Resolution: resolves new V2 release immediately
    const ctx2 = await resolver.resolve("org_res", "chat.welcome", "production");
    expect(ctx2.version.id).toBe(v2.id);
    expect(ctx2.version.version).toBe(2);

    // 4. Pinned Version Resolution: loads explicit historical version
    const pinned = await resolver.resolve("org_res", "chat.welcome", "production", undefined, 1);
    expect(pinned.version.id).toBe(v1.id);
    expect(pinned.isPinnedVersion).toBe(true);
  });

  it("fails closed on non-existent prompt or unreleased environment", async () => {
    await expect(resolver.resolve("org_res", "non_existent_key", "production")).rejects.toThrowError(PromptNotFoundError);
  });
});
