/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from "vitest";
import { validateRequestCapabilities } from "../../src/domain/capability-validator.js";
import {
  GrowXProviderError,
  type NormalizedGenerationRequest,
} from "@growx/contracts";

describe("Capability Validation Unit Tests", () => {
  const baseRequest: NormalizedGenerationRequest = {
    requestId: "req_test_cap_1",
    canonicalModelId: "openai/gpt-4o",
    providerModelId: "gpt-4o",
    messages: [{ role: "user", content: "Hello" }],
  };

  it("passes when all requested capabilities are supported", () => {
    expect(() =>
      validateRequestCapabilities(baseRequest, ["text.generate", "streaming"]),
    ).not.toThrow();
  });

  it("rejects streaming when route lacks streaming capability", () => {
    const streamRequest: NormalizedGenerationRequest = {
      ...baseRequest,
      stream: true,
    };

    expect(() =>
      validateRequestCapabilities(streamRequest, ["text.generate"]),
    ).toThrow(GrowXProviderError);
  });

  it("rejects tools when route lacks tools.call capability", () => {
    const toolsRequest: NormalizedGenerationRequest = {
      ...baseRequest,
      tools: [
        {
          type: "function",
          name: "calculate",
          parameters: { type: "object" },
        },
      ],
    };

    expect(() =>
      validateRequestCapabilities(toolsRequest, ["text.generate", "streaming"]),
    ).toThrow(GrowXProviderError);
  });

  it("rejects structured output when route lacks structured_output capability", () => {
    const structuredRequest: NormalizedGenerationRequest = {
      ...baseRequest,
      structuredOutput: {
        type: "json_object",
      },
    };

    expect(() =>
      validateRequestCapabilities(structuredRequest, [
        "text.generate",
        "streaming",
      ]),
    ).toThrow(GrowXProviderError);
  });

  it("rejects reasoning effort when route lacks text.reason capability", () => {
    const reasoningRequest: NormalizedGenerationRequest = {
      ...baseRequest,
      reasoning: { effort: "high" },
    };

    expect(() =>
      validateRequestCapabilities(reasoningRequest, [
        "text.generate",
        "streaming",
      ]),
    ).toThrow(GrowXProviderError);
  });

  it("rejects image input when route lacks vision.input capability", () => {
    const visionRequest: NormalizedGenerationRequest = {
      ...baseRequest,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Look at this:" },
            {
              type: "image_url",
              imageUrl: { url: "https://example.com/pic.png" },
            },
          ],
        },
      ],
    };

    expect(() =>
      validateRequestCapabilities(visionRequest, [
        "text.generate",
        "streaming",
      ]),
    ).toThrow(GrowXProviderError);
  });
});
