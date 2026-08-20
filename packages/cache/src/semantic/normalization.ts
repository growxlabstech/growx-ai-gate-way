import { createHash } from "node:crypto";
import type { OpenAIChatCompletionRequest } from "@growx/contracts";

export interface NormalizedSemanticInput {
  systemPrompt: string;
  systemPromptHash: string;
  userPrompt: string;
  semanticText: string;
  semanticTextHash: string;
  parametersHash: string;
  responseFormatHash?: string | undefined;
  namespaceHash: string;
}

export function sha256(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

export function normalizeSemanticText(text: string): string {
  if (!text) return "";
  return text
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ");
}

export function extractSemanticInput(params: {
  organizationId: string;
  workspaceId: string;
  canonicalModel: string;
  policyVersion?: number | undefined;
  request: OpenAIChatCompletionRequest;
}): NormalizedSemanticInput {
  const req = params.request as any;
  const messages = Array.isArray(req.messages) ? req.messages : [];

  // 1. Extract system / developer instructions
  let systemPrompt = "";
  const userMessages: string[] = [];

  for (const m of messages) {
    if (m.role === "system" || m.role === "developer") {
      const content = typeof m.content === "string" ? m.content : JSON.stringify(m.content ?? "");
      systemPrompt += (systemPrompt ? "\n" : "") + content;
    } else if (m.role === "user") {
      const content = typeof m.content === "string" ? m.content : JSON.stringify(m.content ?? "");
      userMessages.push(content);
    }
  }

  const systemPromptHash = sha256(systemPrompt.trim());

  // 2. User query text (latest user turn for single-turn semantic matching)
  const rawUserText = userMessages.join(" \n ");
  const normalizedUserText = normalizeSemanticText(rawUserText);
  const semanticTextHash = sha256(normalizedUserText);

  // 3. Parameters Hash
  const paramObj = {
    temperature: req.temperature ?? 0,
    top_p: req.top_p ?? 1,
    max_tokens: req.max_tokens ?? req.max_completion_tokens ?? null,
    presence_penalty: req.presence_penalty ?? 0,
    frequency_penalty: req.frequency_penalty ?? 0,
    stop: req.stop ?? null,
  };
  const parametersHash = sha256(JSON.stringify(paramObj));

  // 4. Response Format Hash
  let responseFormatHash: string | undefined;
  if (req.response_format) {
    responseFormatHash = sha256(JSON.stringify(req.response_format));
  }

  // 5. Namespace Hash
  const namespaceElements = [
    params.organizationId,
    params.workspaceId,
    params.canonicalModel,
    systemPromptHash,
    String(params.policyVersion ?? 1),
    parametersHash,
    responseFormatHash ?? "none",
  ];
  const namespaceHash = sha256(namespaceElements.join(":"));

  return {
    systemPrompt,
    systemPromptHash,
    userPrompt: rawUserText,
    semanticText: normalizedUserText,
    semanticTextHash,
    parametersHash,
    responseFormatHash,
    namespaceHash,
  };
}
