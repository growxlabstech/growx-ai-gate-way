import { describe, it, expect } from "vitest";
import { GrowXCLI } from "../src/index.js";

describe("GrowX CLI", () => {
  const cli = new GrowXCLI("gx_live_test_cli");

  it("handles auth and config subcommands", async () => {
    const authRes = await cli.run(["auth"]);
    expect(authRes.exitCode).toBe(0);
    expect(authRes.stdout).toContain("Current API Key");

    const configRes = await cli.run(["config", "--json"]);
    expect(configRes.exitCode).toBe(0);
    expect(JSON.parse(configRes.stdout).version).toBe("0.1.0");
  });

  it("lists models and runs chat prompts via CLI", async () => {
    const modelsRes = await cli.run(["models", "list", "--json"]);
    expect(modelsRes.exitCode).toBe(0);
    expect(JSON.parse(modelsRes.stdout).length).toBeGreaterThanOrEqual(3);

    const chatRes = await cli.run(["chat", "Tell me a joke", "gpt-4o"]);
    expect(chatRes.exitCode).toBe(0);
    expect(chatRes.stdout).toContain("Tell me a joke");
  });
});
