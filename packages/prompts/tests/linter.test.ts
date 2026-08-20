import { describe, it, expect } from "vitest";
import { PromptLinter } from "../src/linter.js";

describe("PromptLinter Structural Validation", () => {
  it("detects undefined variables in template", () => {
    const issues = PromptLinter.lint(
      [{ role: "user", contentTemplate: "Hello {{name}}, your order {{order_id}} is ready" }],
      undefined,
      [{ name: "name", type: "string", required: true }]
    );

    expect(issues.some(i => i.code === "UNDEFINED_VARIABLE" && i.variable === "order_id")).toBe(true);
  });

  it("warns about unused required variables in schema", () => {
    const issues = PromptLinter.lint(
      [{ role: "user", contentTemplate: "Hello {{name}}" }],
      undefined,
      [
        { name: "name", type: "string", required: true },
        { name: "unused_var", type: "string", required: true },
      ]
    );

    expect(issues.some(i => i.code === "UNUSED_REQUIRED_VARIABLE" && i.variable === "unused_var")).toBe(true);
  });

  it("detects duplicate variable declarations in schema", () => {
    const issues = PromptLinter.lint(
      [{ role: "user", contentTemplate: "Hello {{name}}" }],
      undefined,
      [
        { name: "name", type: "string", required: true },
        { name: "name", type: "string", required: false },
      ]
    );

    expect(issues.some(i => i.code === "DUPLICATE_VARIABLE" && i.variable === "name")).toBe(true);
  });

  it("warns about system message placed after user message", () => {
    const issues = PromptLinter.lint(
      [
        { role: "user", contentTemplate: "User question" },
        { role: "system", contentTemplate: "System instruction" },
      ],
      undefined,
      []
    );

    expect(issues.some(i => i.code === "SYSTEM_MESSAGE_AFTER_USER")).toBe(true);
  });
});
