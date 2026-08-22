import { GrowXAI } from "@growx/ai";

export interface CLICommandResult {
  stdout: string;
  exitCode: number;
}

export class GrowXCLI {
  private apiKey: string;
  private baseUrl: string;

  constructor(
    apiKey: string = "gx_live_default_cli_key",
    baseUrl: string = "https://api.growxlabs.tech",
  ) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  public async run(args: string[]): Promise<CLICommandResult> {
    const cmd = args[0] || "help";
    const isJson = args.includes("--json");

    if (cmd === "auth") {
      const keyArg = args[1];
      if (keyArg) {
        this.apiKey = keyArg;
        return {
          stdout: isJson
            ? JSON.stringify({ status: "authenticated" })
            : "✓ Successfully authenticated with GrowX.",
          exitCode: 0,
        };
      }
      return {
        stdout: isJson
          ? JSON.stringify({ apiKey: this.apiKey })
          : `Current API Key: ${this.apiKey.substring(0, 10)}...`,
        exitCode: 0,
      };
    }

    if (cmd === "models" && args[1] === "list") {
      // Mock fetcher for CLI offline list
      const client = new GrowXAI({
        apiKey: this.apiKey,
        baseURL: this.baseUrl,
        fetch: async () =>
          new Response(
            JSON.stringify({
              data: [
                { id: "gpt-4o", owned_by: "growx" },
                { id: "claude-3-5-sonnet", owned_by: "growx" },
                { id: "gemini-1.5-pro", owned_by: "growx" },
              ],
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
      });

      const modelsRes = await client.models.list();
      const models = modelsRes.data;
      return {
        stdout: isJson
          ? JSON.stringify(models)
          : models
              .map((m: any) => `- ${m.id} (${m.owned_by || "growx"})`)
              .join("\n"),
        exitCode: 0,
      };
    }

    if (cmd === "chat") {
      const prompt = args[1] || "Hello";
      const model = args[2] || "gpt-4o";

      const client = new GrowXAI({
        apiKey: this.apiKey,
        baseURL: this.baseUrl,
        fetch: async () =>
          new Response(
            JSON.stringify({
              id: "chatcmpl_mock123",
              choices: [
                {
                  message: { role: "assistant", content: `Echo: ${prompt}` },
                  finish_reason: "stop",
                },
              ],
              usage: {
                prompt_tokens: 10,
                completion_tokens: 15,
                total_tokens: 25,
              },
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
      });

      const res = await client.chat.completions.create({
        model,
        messages: [{ role: "user", content: prompt }],
      });

      return {
        stdout: isJson ? JSON.stringify(res) : res.choices[0].message.content,
        exitCode: 0,
      };
    }

    if (cmd === "config") {
      const config = { apiHostname: this.baseUrl, version: "0.1.0" };
      return {
        stdout: isJson
          ? JSON.stringify(config)
          : `GrowX CLI Config: ${JSON.stringify(config, null, 2)}`,
        exitCode: 0,
      };
    }

    return {
      stdout:
        "GrowX AI Gateway CLI\nUsage: growx [auth | models list | chat <prompt> | config] [--json]",
      exitCode: 0,
    };
  }
}
