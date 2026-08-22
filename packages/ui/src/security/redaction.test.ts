import { describe, expect, it } from "vitest";
import { redactSecret, redactValue } from "./redaction";

describe("UI secret redaction", () => {
  it("redacts bearer and GrowX credentials", () => {
    expect(redactSecret("Bearer abc.def gx_live_key_123_secret_value")).toBe(
      "[REDACTED] [REDACTED]",
    );
  });

  it("redacts sensitive object fields recursively", () => {
    expect(
      redactValue({
        authorization: "Bearer token",
        nested: { password: "secret" },
      }),
    ).toEqual({
      authorization: "[REDACTED]",
      nested: { password: "[REDACTED]" },
    });
  });
});
