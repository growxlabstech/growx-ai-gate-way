import { describe, expect, it } from "vitest";
import { isCanonicalModelAllowedByKey } from "../../src/domain/api-key-matcher.js";

describe("API Key Model Restriction Pattern Matcher Unit Tests", () => {
  it("allows all models when no modelRules are defined", () => {
    const res = isCanonicalModelAllowedByKey({ modelRules: [] }, "openai/gpt-4o");
    expect(res.allowed).toBe(true);
  });

  it("allows model when exact allow pattern matches", () => {
    const res = isCanonicalModelAllowedByKey(
      {
        modelRules: [{ pattern: "openai/gpt-4o", effect: "allow" }],
      },
      "openai/gpt-4o"
    );
    expect(res.allowed).toBe(true);
  });

  it("allows model with wildcard pattern (openai/*)", () => {
    const res = isCanonicalModelAllowedByKey(
      {
        modelRules: [{ pattern: "openai/*", effect: "allow" }],
      },
      "openai/gpt-4o-mini"
    );
    expect(res.allowed).toBe(true);
  });

  it("denies model not matched by allow list", () => {
    const res = isCanonicalModelAllowedByKey(
      {
        modelRules: [{ pattern: "openai/*", effect: "allow" }],
      },
      "anthropic/claude-3-5-sonnet"
    );
    expect(res.allowed).toBe(false);
    expect(res.reason).toContain("not included in the API key allowed models list");
  });

  it("enforces explicit deny rule override over allow wildcard", () => {
    const res = isCanonicalModelAllowedByKey(
      {
        modelRules: [
          { pattern: "*", effect: "allow" },
          { pattern: "anthropic/*", effect: "deny" },
        ],
      },
      "anthropic/claude-3-5-sonnet"
    );
    expect(res.allowed).toBe(false);
    expect(res.reason).toContain("denied by API key rule pattern 'anthropic/*'");
  });

  it("filters by category in rule", () => {
    const res = isCanonicalModelAllowedByKey(
      {
        modelRules: [
          { pattern: "openai/*", effect: "allow", category: "embeddings" },
        ],
      },
      "openai/gpt-4o",
      "chat"
    );
    expect(res.allowed).toBe(false);

    const embedRes = isCanonicalModelAllowedByKey(
      {
        modelRules: [
          { pattern: "openai/*", effect: "allow", category: "embeddings" },
        ],
      },
      "openai/text-embedding-3-small",
      "embeddings"
    );
    expect(embedRes.allowed).toBe(true);
  });
});
