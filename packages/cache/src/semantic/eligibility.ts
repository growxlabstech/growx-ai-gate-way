import type { OpenAIChatCompletionRequest } from "@growx/contracts";
import type { SemanticCachePolicy, SemanticMissReason } from "./types.js";

const TEMPORAL_FRESHNESS_PATTERNS = [
  /\b(today|tonight|right now|latest|current time|current date|this morning|this afternoon|live data|realtime)\b/i,
];

export interface SemanticEligibilityDecision {
  eligible: boolean;
  reason?: SemanticMissReason | undefined;
}

export function evaluateSemanticCacheEligibility(
  request: OpenAIChatCompletionRequest,
  policy: SemanticCachePolicy
): SemanticEligibilityDecision {
  if (!policy.enabled) {
    return { eligible: false, reason: "disabled" };
  }

  const req = request as any;

  // 1. Tool calls & function declarations are strictly excluded from semantic caching
  if (Array.isArray(req.tools) && req.tools.length > 0) {
    return { eligible: false, reason: "ineligible" };
  }
  if (Array.isArray(req.functions) && req.functions.length > 0) {
    return { eligible: false, reason: "ineligible" };
  }

  // 2. High temperature without seed is non-deterministic
  const temp = req.temperature ?? 0;
  if (temp > policy.maxTemperature && req.seed === undefined) {
    return { eligible: false, reason: "ineligible" };
  }

  // 3. Multi-choice requests (n > 1) are non-deterministic
  if (req.n && req.n > 1) {
    return { eligible: false, reason: "ineligible" };
  }

  // 4. Model allowlist
  if (policy.allowedModels && policy.allowedModels.length > 0) {
    if (!policy.allowedModels.includes(req.model)) {
      return { eligible: false, reason: "model_mismatch" };
    }
  }

  // 5. Multi-turn chat (conversations with multiple turns) excluded by conservative default
  const messages = Array.isArray(req.messages) ? req.messages : [];
  const nonSystemMessages = messages.filter(
    (m: any) => m.role !== "system" && m.role !== "developer"
  );
  if (nonSystemMessages.length > 2) {
    // More than 1 prompt-response turn -> conservative exclusion
    return { eligible: false, reason: "ineligible" };
  }

  // 6. Freshness / Temporal keywords check
  for (const m of nonSystemMessages) {
    const text = typeof m.content === "string" ? m.content : "";
    for (const pattern of TEMPORAL_FRESHNESS_PATTERNS) {
      if (pattern.test(text)) {
        return { eligible: false, reason: "ineligible" };
      }
    }
  }

  return { eligible: true };
}
