import { describe, it, expect } from "vitest";
import { PromptDiffUtil } from "../src/diff.js";
import type { PromptVersion } from "@growx/contracts";

describe("PromptDiffUtil", () => {
  it("calculates structured diff between two prompt versions", () => {
    const v1: PromptVersion = {
      id: "v1",
      promptId: "p1",
      version: 1,
      messages: [{ role: "user", contentTemplate: "Hello {{name}}" }],
      templateFormat: "mustache",
      variableSchema: [{ name: "name", type: "string", required: true }],
      metadata: {},
      contentHash: "hash1",
      requiredCapabilities: ["text.generate"],
      allowedModels: [],
      createdBy: "usr_1",
      createdAt: new Date(),
    };

    const v2: PromptVersion = {
      id: "v2",
      promptId: "p1",
      version: 2,
      messages: [
        { role: "system", contentTemplate: "You are an assistant." },
        { role: "user", contentTemplate: "Hello {{name}}, role: {{role}}" },
      ],
      templateFormat: "mustache",
      variableSchema: [
        { name: "name", type: "string", required: true },
        { name: "role", type: "string", required: false },
      ],
      metadata: {},
      contentHash: "hash2",
      requiredCapabilities: ["text.generate", "tools.call"],
      allowedModels: [],
      createdBy: "usr_1",
      createdAt: new Date(),
    };

    const diff = PromptDiffUtil.diff(v1, v2);
    expect(diff.versionA).toBe(1);
    expect(diff.versionB).toBe(2);
    expect(diff.messagesChanged).toBe(true);
    expect(diff.variablesAdded).toEqual(["role"]);
    expect(diff.variablesRemoved).toEqual([]);
    expect(diff.capabilitiesChanged).toBe(true);
  });
});
