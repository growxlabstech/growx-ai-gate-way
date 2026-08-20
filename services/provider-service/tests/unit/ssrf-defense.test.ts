/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from "vitest";
import { validateProviderBaseUrl } from "../../src/domain/ssrf-validator.js";
import { GrowXProviderError } from "@growx/contracts";

describe("SSRF Defense Unit Tests", () => {
  it("allows valid HTTPS URLs in production", () => {
    expect(() => validateProviderBaseUrl("https://api.openai.com/v1", true)).not.toThrow();
    expect(() => validateProviderBaseUrl("https://api.anthropic.com", true)).not.toThrow();
    expect(() => validateProviderBaseUrl("https://generativelanguage.googleapis.com", true)).not.toThrow();
  });

  it("blocks plain HTTP in production", () => {
    expect(() => validateProviderBaseUrl("http://api.openai.com/v1", true)).toThrow(
      GrowXProviderError
    );
  });

  it("blocks localhost and loopback in production", () => {
    expect(() => validateProviderBaseUrl("https://localhost:8080", true)).toThrow(
      GrowXProviderError
    );
    expect(() => validateProviderBaseUrl("https://127.0.0.1:4000", true)).toThrow(
      GrowXProviderError
    );
  });

  it("blocks private network addresses in production", () => {
    expect(() => validateProviderBaseUrl("https://10.0.0.5/api", true)).toThrow(
      GrowXProviderError
    );
    expect(() => validateProviderBaseUrl("https://192.168.1.1", true)).toThrow(
      GrowXProviderError
    );
    expect(() => validateProviderBaseUrl("https://172.16.50.1", true)).toThrow(
      GrowXProviderError
    );
    expect(() => validateProviderBaseUrl("https://169.254.169.254/latest/meta-data", true)).toThrow(
      GrowXProviderError
    );
  });

  it("allows HTTP and local addresses in non-production environment", () => {
    expect(() => validateProviderBaseUrl("http://127.0.0.1:4000", false)).not.toThrow();
    expect(() => validateProviderBaseUrl("http://localhost:3000", false)).not.toThrow();
  });
});
