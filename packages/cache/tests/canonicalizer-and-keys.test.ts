import { describe, expect, it } from "vitest";
import {
  canonicalJsonStringify,
  canonicalizeRequest,
  buildExactCacheKey,
} from "../src/index.js";
import type { OpenAIChatCompletionRequest } from "@growx/contracts";

describe("Canonical Request Serializer & Versioned Key Builder", () => {
  it("sorts object keys alphabetically while strictly preserving message array order", () => {
    const objA = { b: 2, a: 1, c: { z: 26, y: 25 } };
    const objB = { a: 1, c: { y: 25, z: 26 }, b: 2 };

    expect(canonicalJsonStringify(objA)).toBe(canonicalJsonStringify(objB));
    expect(canonicalJsonStringify(objA)).toBe('{"a":1,"b":2,"c":{"y":25,"z":26}}');
  });

  it("is sensitive to message ordering in conversations", () => {
    const req1: OpenAIChatCompletionRequest = {
      model: "gpt-4o",
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "Hello world" },
      ],
      temperature: 0,
    };

    const req2: OpenAIChatCompletionRequest = {
      model: "gpt-4o",
      messages: [
        { role: "user", content: "Hello world" },
        { role: "system", content: "You are a helpful assistant." },
      ],
      temperature: 0,
    };

    const digest1 = canonicalizeRequest(req1).requestDigest;
    const digest2 = canonicalizeRequest(req2).requestDigest;

    expect(digest1).not.toBe(digest2);
  });

  it("normalizes tool declaration order", () => {
    const req1: OpenAIChatCompletionRequest = {
      model: "gpt-4o",
      messages: [{ role: "user", content: "What is the weather?" }],
      tools: [
        { type: "function", function: { name: "get_weather", description: "Get weather" } },
        { type: "function", function: { name: "get_location", description: "Get location" } },
      ],
      temperature: 0,
    };

    const req2: OpenAIChatCompletionRequest = {
      model: "gpt-4o",
      messages: [{ role: "user", content: "What is the weather?" }],
      tools: [
        { type: "function", function: { name: "get_location", description: "Get location" } },
        { type: "function", function: { name: "get_weather", description: "Get weather" } },
      ],
      temperature: 0,
    };

    const digest1 = canonicalizeRequest(req1).requestDigest;
    const digest2 = canonicalizeRequest(req2).requestDigest;

    expect(digest1).toBe(digest2);
  });

  it("guarantees tenant isolation in cache keys", () => {
    const { cacheKey: keyA } = buildExactCacheKey({
      organizationId: "org_alpha",
      workspaceId: "ws_alpha",
      canonicalModelId: "openai/gpt-4o",
      modelVersion: "v2024_08_06",
      policyFingerprint: "pol_fp_1",
      requestDigest: "req_digest_123",
    });

    const { cacheKey: keyB } = buildExactCacheKey({
      organizationId: "org_beta",
      workspaceId: "ws_beta",
      canonicalModelId: "openai/gpt-4o",
      modelVersion: "v2024_08_06",
      policyFingerprint: "pol_fp_1",
      requestDigest: "req_digest_123",
    });

    expect(keyA).toContain("org_alpha:ws_alpha");
    expect(keyB).toContain("org_beta:ws_beta");
    expect(keyA).not.toBe(keyB);
  });

  it("changes cache key when policy fingerprint or model version changes", () => {
    const baseParams = {
      organizationId: "org_alpha",
      workspaceId: "ws_alpha",
      canonicalModelId: "openai/gpt-4o",
      modelVersion: "v2024_08_06",
      policyFingerprint: "pol_fp_1",
      requestDigest: "req_digest_123",
    };

    const key1 = buildExactCacheKey(baseParams).cacheKey;
    const keyPolicyChanged = buildExactCacheKey({ ...baseParams, policyFingerprint: "pol_fp_2" }).cacheKey;
    const keyVersionChanged = buildExactCacheKey({ ...baseParams, modelVersion: "v2024_11_20" }).cacheKey;

    expect(key1).not.toBe(keyPolicyChanged);
    expect(key1).not.toBe(keyVersionChanged);
  });
});
