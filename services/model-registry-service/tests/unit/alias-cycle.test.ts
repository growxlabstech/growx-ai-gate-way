import { describe, expect, it } from "vitest";
import { resolveAliasChain } from "../../src/domain/resolver.js";
import type { ModelAliasEntity } from "../../src/domain/types.js";

describe("Alias Resolution & Cycle Detection Unit Tests", () => {
  it("resolves direct 1-hop alias", () => {
    const aliases: ModelAliasEntity[] = [
      {
        id: "a1",
        alias: "fast",
        canonicalModelId: "google/gemini-1.5-flash",
        status: "active",
        type: "static",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const result = resolveAliasChain("fast", aliases);
    expect(result.canonicalModelId).toBe("google/gemini-1.5-flash");
    expect(result.aliasUsed?.alias).toBe("fast");
  });

  it("resolves multi-hop alias chain (fast -> gpt-mini -> openai/gpt-4o-mini)", () => {
    const aliases: ModelAliasEntity[] = [
      {
        id: "a1",
        alias: "fast",
        canonicalModelId: "gpt-mini",
        status: "active",
        type: "product",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "a2",
        alias: "gpt-mini",
        canonicalModelId: "openai/gpt-4o-mini",
        status: "active",
        type: "version",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const result = resolveAliasChain("fast", aliases);
    expect(result.canonicalModelId).toBe("openai/gpt-4o-mini");
    expect(result.aliasUsed?.alias).toBe("fast");
    expect(result.aliasUsed?.type).toBe("product");
  });

  it("detects direct 2-node cycle (A -> B -> A) and throws error", () => {
    const aliases: ModelAliasEntity[] = [
      {
        id: "a1",
        alias: "alias-a",
        canonicalModelId: "alias-b",
        status: "active",
        type: "static",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "a2",
        alias: "alias-b",
        canonicalModelId: "alias-a",
        status: "active",
        type: "static",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    expect(() => resolveAliasChain("alias-a", aliases)).toThrow(
      /Alias cycle detected/,
    );
  });

  it("detects 3-node cycle (A -> B -> C -> A) and throws error", () => {
    const aliases: ModelAliasEntity[] = [
      {
        id: "a1",
        alias: "alias-a",
        canonicalModelId: "alias-b",
        status: "active",
        type: "static",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "a2",
        alias: "alias-b",
        canonicalModelId: "alias-c",
        status: "active",
        type: "static",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "a3",
        alias: "alias-c",
        canonicalModelId: "alias-a",
        status: "active",
        type: "static",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    expect(() => resolveAliasChain("alias-a", aliases)).toThrow(
      /Alias cycle detected/,
    );
  });

  it("ignores inactive or retired aliases in chain", () => {
    const aliases: ModelAliasEntity[] = [
      {
        id: "a1",
        alias: "fast",
        canonicalModelId: "openai/gpt-4o-mini",
        status: "retired",
        type: "static",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const result = resolveAliasChain("fast", aliases);
    // When alias is inactive, it doesn't resolve to target and retains original requested ID
    expect(result.canonicalModelId).toBe("fast");
    expect(result.aliasUsed).toBeUndefined();
  });
});
