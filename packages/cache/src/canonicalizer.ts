import { createHash } from "node:crypto";
import type { OpenAIChatCompletionRequest } from "@growx/contracts";

export function canonicalJsonStringify(value: unknown): string {
  if (value === null || value === undefined) {
    return "null";
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "null";
    return Object.is(value, -0) ? "0" : value.toString();
  }
  if (typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return "[" + value.map(canonicalJsonStringify).join(",") + "]";
  }
  if (typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>).sort((a, b) =>
      a.localeCompare(b),
    );
    const parts: string[] = [];
    for (const key of keys) {
      const val = (value as Record<string, unknown>)[key];
      if (val !== undefined) {
        parts.push(JSON.stringify(key) + ":" + canonicalJsonStringify(val));
      }
    }
    return "{" + parts.join(",") + "}";
  }
  return JSON.stringify(value);
}

export function canonicalizeRequest(request: OpenAIChatCompletionRequest): {
  canonicalString: string;
  requestDigest: string;
} {
  const req = request as any;
  const normalizedTemperature =
    req.temperature !== undefined
      ? Math.round(req.temperature * 1000) / 1000
      : 0;
  const normalizedTopP =
    req.top_p !== undefined ? Math.round(req.top_p * 1000) / 1000 : 1;

  let normalizedTools: unknown = undefined;
  if (Array.isArray(req.tools) && req.tools.length > 0) {
    normalizedTools = [...req.tools].sort((a: any, b: any) => {
      const nameA = a.function?.name ?? "";
      const nameB = b.function?.name ?? "";
      return nameA.localeCompare(nameB);
    });
  }

  const canonicalPayload = {
    messages: req.messages,
    temperature: normalizedTemperature,
    top_p: normalizedTopP,
    max_tokens: req.max_tokens ?? req.max_completion_tokens ?? undefined,
    stop: req.stop ?? undefined,
    tools: normalizedTools,
    tool_choice: req.tool_choice ?? undefined,
    response_format: req.response_format ?? undefined,
    seed: req.seed ?? undefined,
    presence_penalty: req.presence_penalty ?? 0,
    frequency_penalty: req.frequency_penalty ?? 0,
  };

  const canonicalString = canonicalJsonStringify(canonicalPayload);
  const requestDigest = createHash("sha256")
    .update(canonicalString, "utf8")
    .digest("hex");

  return { canonicalString, requestDigest };
}
