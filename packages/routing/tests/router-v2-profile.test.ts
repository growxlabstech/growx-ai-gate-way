import { describe, expect, it } from "vitest";
import {
  buildRequestCapabilityProfile,
  classifyWorkload,
  hashRequestCapabilityProfile,
} from "../src/profile.js";

describe("Router V2 - Request Capability Profile", () => {
  it("classifies workload correctly based on parameters", () => {
    expect(classifyWorkload({ batch: true })).toBe("batch");
    expect(classifyWorkload({ reasoningMode: true })).toBe("reasoning");
    expect(classifyWorkload({ toolCalling: true })).toBe("tool_call");
    expect(classifyWorkload({ structuredOutput: true })).toBe("structured_generation");
    expect(classifyWorkload({ inputModalities: ["image"] })).toBe("image");
    expect(classifyWorkload({ inputModalities: ["audio"] })).toBe("audio");
    expect(classifyWorkload({ streaming: true })).toBe("realtime_interactive");
    expect(classifyWorkload({ streaming: false })).toBe("realtime_background");
  });

  it("builds a complete RequestCapabilityProfile with defaults", () => {
    const profile = buildRequestCapabilityProfile({
      canonicalModelId: "growx/fast",
      streaming: true,
      contextTokensEstimated: 1500,
      maxOutputTokens: 2000,
      dataResidencyRequirement: "india",
      maxExecutionCostMinor: 5000,
    });

    expect(profile.canonicalModelId).toBe("growx/fast");
    expect(profile.workloadType).toBe("realtime_interactive");
    expect(profile.latencyClass).toBe("interactive");
    expect(profile.streaming).toBe(true);
    expect(profile.contextTokensEstimated).toBe(1500);
    expect(profile.maxOutputTokens).toBe(2000);
    expect(profile.dataResidencyRequirement).toBe("india");
    expect(profile.maxExecutionCostMinor).toBe(5000);
  });

  it("produces deterministic SHA-256 hashes of the profile", () => {
    const p1 = buildRequestCapabilityProfile({
      canonicalModelId: "growx/fast",
      streaming: true,
      contextTokensEstimated: 1000,
    });
    const p2 = buildRequestCapabilityProfile({
      canonicalModelId: "growx/fast",
      streaming: true,
      contextTokensEstimated: 1000,
    });
    const p3 = buildRequestCapabilityProfile({
      canonicalModelId: "growx/fast",
      streaming: false,
      contextTokensEstimated: 1000,
    });

    const h1 = hashRequestCapabilityProfile(p1);
    const h2 = hashRequestCapabilityProfile(p2);
    const h3 = hashRequestCapabilityProfile(p3);

    expect(h1).toBe(h2);
    expect(h1).not.toBe(h3);
    expect(h1.length).toBe(64);
  });
});
