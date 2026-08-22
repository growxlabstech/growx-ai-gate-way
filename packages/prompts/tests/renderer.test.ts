import { describe, it, expect } from "vitest";
import { PromptTemplateRenderer } from "../src/renderer.js";
import { PromptValidationError, PromptRenderError } from "../src/errors.js";
import type { PromptVersion } from "@growx/contracts";

describe("PromptTemplateRenderer", () => {
  const baseVersion: PromptVersion = {
    id: "pver_1",
    promptId: "pdef_1",
    version: 1,
    messages: [
      {
        role: "system",
        contentTemplate: "You are a customer support agent for {{company}}.",
      },
      {
        role: "user",
        contentTemplate:
          "Customer inquiry: {{inquiry_text}}\nUser tier: {{tier}}",
      },
    ],
    templateFormat: "mustache",
    variableSchema: [
      {
        name: "company",
        type: "string",
        required: true,
        defaultValue: "GrowX AI",
      },
      { name: "inquiry_text", type: "string", required: true, maxLength: 500 },
      {
        name: "tier",
        type: "string",
        required: true,
        enum: ["free", "pro", "enterprise"],
      },
      { name: "account_id", type: "string", required: false, sensitive: true },
    ],
    metadata: {},
    contentHash: "hash_v1",
    requiredCapabilities: ["text.generate"],
    allowedModels: [],
    createdBy: "usr_test",
    createdAt: new Date(),
  };

  it("renders multi-message prompt deterministically with valid variables", () => {
    const result = PromptTemplateRenderer.render(baseVersion, {
      company: "GrowX Labs",
      inquiry_text: "How do I upgrade to enterprise?",
      tier: "pro",
    });

    expect(result.renderedMessages.length).toBe(2);
    expect(result.renderedMessages[0]).toEqual({
      role: "system",
      content: "You are a customer support agent for GrowX Labs.",
    });
    expect(result.renderedMessages[1]).toEqual({
      role: "user",
      content:
        "Customer inquiry: How do I upgrade to enterprise?\nUser tier: pro",
    });
    expect(result.renderedHash).toBeDefined();
    expect(result.sensitiveVariableNames).toEqual(["account_id"]);
  });

  it("applies default values for missing optional variables with defaults", () => {
    const result = PromptTemplateRenderer.render(baseVersion, {
      inquiry_text: "Billing issue",
      tier: "free",
    });
    expect(result.renderedMessages[0]?.content).toBe(
      "You are a customer support agent for GrowX AI.",
    );
  });

  it("fails fast when required variable without default is missing", () => {
    expect(() => {
      PromptTemplateRenderer.render(baseVersion, {
        company: "GrowX Labs",
        tier: "pro",
      });
    }).toThrowError(PromptValidationError);
  });

  it("fails fast when extra unknown variable is passed", () => {
    expect(() => {
      PromptTemplateRenderer.render(baseVersion, {
        company: "GrowX Labs",
        inquiry_text: "Hello",
        tier: "pro",
        injected_param: "malicious_content",
      });
    }).toThrowError(PromptValidationError);
  });

  it("enforces variable type, enum, and maxLength constraints", () => {
    // Enum mismatch
    expect(() => {
      PromptTemplateRenderer.render(baseVersion, {
        inquiry_text: "Hello",
        tier: "invalid_tier",
      });
    }).toThrowError(PromptValidationError);

    // Max length exceeded
    expect(() => {
      PromptTemplateRenderer.render(baseVersion, {
        inquiry_text: "a".repeat(501),
        tier: "pro",
      });
    }).toThrowError(PromptValidationError);
  });

  it("handles complex variable types (number, boolean, array, object)", () => {
    const complexVersion: PromptVersion = {
      id: "pver_2",
      promptId: "pdef_2",
      version: 1,
      messages: [
        {
          role: "user",
          contentTemplate:
            "Count: {{count}}, Active: {{active}}, Items: {{items}}, Metadata: {{meta}}",
        },
      ],
      templateFormat: "mustache",
      variableSchema: [
        { name: "count", type: "number", required: true },
        { name: "active", type: "boolean", required: true },
        { name: "items", type: "array", required: true },
        { name: "meta", type: "object", required: true },
      ],
      metadata: {},
      contentHash: "hash_v2",
      requiredCapabilities: [],
      allowedModels: [],
      createdBy: "usr_test",
      createdAt: new Date(),
    };

    const result = PromptTemplateRenderer.render(complexVersion, {
      count: 42,
      active: true,
      items: ["apple", "banana"],
      meta: { priority: "high" },
    });

    expect(result.renderedMessages[0]?.content).toContain("Count: 42");
    expect(result.renderedMessages[0]?.content).toContain("Active: true");
    expect(result.renderedMessages[0]?.content).toContain('"apple"');
    expect(result.renderedMessages[0]?.content).toContain('"priority": "high"');
  });

  it("rejects total rendered prompt size exceeding limit", () => {
    const hugeVersion: PromptVersion = {
      id: "pver_3",
      promptId: "pdef_3",
      version: 1,
      messages: [{ role: "user", contentTemplate: "{{big_text}}" }],
      templateFormat: "mustache",
      variableSchema: [{ name: "big_text", type: "string", required: true }],
      metadata: {},
      contentHash: "hash_v3",
      requiredCapabilities: [],
      allowedModels: [],
      createdBy: "usr_test",
      createdAt: new Date(),
    };

    expect(() => {
      PromptTemplateRenderer.render(
        hugeVersion,
        { big_text: "a".repeat(2000) },
        { maxTotalRenderBytes: 1000 },
      );
    }).toThrowError(PromptRenderError);
  });
});
