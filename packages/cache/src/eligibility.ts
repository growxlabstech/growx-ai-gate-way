import type { OpenAIChatCompletionRequest } from "@growx/contracts";
import type { CacheEligibilityDecision, CachePolicyConfig } from "./types.js";

export function evaluateCacheEligibility(
  request: OpenAIChatCompletionRequest,
  policyConfig: CachePolicyConfig,
  modelContext?: { supportsStreaming?: boolean; category?: string } | undefined
): CacheEligibilityDecision {
  if (!policyConfig.enabled) {
    return { eligible: false, reason: "DISABLED", scope: "none" };
  }

  const req = request as any;

  // Check temperature & determinism
  const temp = req.temperature ?? 0;
  if (policyConfig.deterministicOnly && temp > 0) {
    const seed = req.seed;
    if (seed === undefined) {
      return { eligible: false, reason: "NON_DETERMINISTIC", scope: "none" };
    }
  }

  // Tool calls: default is safe (no-cache when tools are declared, unless empty)
  if (Array.isArray(req.tools) && req.tools.length > 0) {
    return { eligible: false, reason: "TOOLS_UNSAFE", scope: "none" };
  }

  // Multi-choice requests (n > 1) are non-deterministic
  if (req.n && req.n > 1) {
    return { eligible: false, reason: "NON_DETERMINISTIC", scope: "none" };
  }

  // Model allowed list check
  if (policyConfig.allowedModels && policyConfig.allowedModels.length > 0) {
    const isModelAllowed = policyConfig.allowedModels.includes(req.model);
    if (!isModelAllowed) {
      return { eligible: false, reason: "MODEL_DISABLED", scope: "none" };
    }
  }

  return {
    eligible: true,
    ttlSeconds: policyConfig.defaultTtlSeconds,
    scope: "workspace",
  };
}
