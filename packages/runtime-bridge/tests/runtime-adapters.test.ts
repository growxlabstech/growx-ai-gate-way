import { describe, it, expect } from "vitest";
import { TypeScriptRuntimeAdapter } from "../src/runtime-adapters/typescript-adapter.js";
import { GoRuntimeAdapter } from "../src/runtime-adapters/go-runtime-adapter.js";
import { RustTokenizerAdapter } from "../src/runtime-adapters/rust-tokenizer-adapter.js";

describe("Runtime Adapters", () => {
  it("executes via TypeScript runtime adapter", async () => {
    const ts = new TypeScriptRuntimeAdapter();
    const res = await ts.execute({
      id: "ts_1",
      prompt: "ping",
      model: "gpt-4o",
    });
    expect(res.runtime).toBe("typescript");
    expect(res.status).toBe("success");
    expect(res.content).toContain("ping");
  });

  it("executes via Go runtime proxy adapter", async () => {
    const go = new GoRuntimeAdapter();
    const res = await go.execute({
      id: "go_1",
      prompt: "ping",
      model: "gpt-4o",
    });
    expect(res.runtime).toBe("go_runtime");
    expect(res.status).toBe("success");
    expect(res.content).toContain("ping");
  });

  it("tokenizes using Rust tokenizer adapter", () => {
    const tokens = RustTokenizerAdapter.countTokens("The quick brown fox");
    expect(tokens).toBeGreaterThan(0);
    expect(RustTokenizerAdapter.countTokens("")).toBe(0);
  });
});
