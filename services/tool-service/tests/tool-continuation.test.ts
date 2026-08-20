import { describe, it, expect } from "vitest";
import {
  ToolContinuationService,
  InMemoryContinuationRepository,
} from "../src/application/tool-continuation-service.js";

describe("ToolContinuationService", () => {
  it("creates and resolves a continuation", async () => {
    const service = new ToolContinuationService(new InMemoryContinuationRepository());

    const cont = await service.createContinuation({
      requestId: "req_123",
      organizationId: "org_1",
      providerId: "openai",
      routeId: "route_1",
      modelId: "gpt-4o",
    });

    expect(cont.id).toMatch(/^tcont_/);
    expect(cont.status).toBe("pending");

    const resolved = await service.resolveContinuation("req_123");
    expect(resolved).not.toBeNull();
    expect(resolved!.id).toBe(cont.id);
  });

  it("completes a continuation", async () => {
    const service = new ToolContinuationService(new InMemoryContinuationRepository());

    const cont = await service.createContinuation({
      requestId: "req_456",
      organizationId: "org_1",
      providerId: "anthropic",
      routeId: "route_2",
      modelId: "claude-4",
    });

    await service.completeContinuation(cont.id);

    const resolved = await service.resolveContinuation("req_456");
    expect(resolved).toBeNull();
  });
});
