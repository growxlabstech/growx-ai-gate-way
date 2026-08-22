import type {
  BatchRoutePolicyEvaluationResult,
  EffectivePolicy,
  PolicyDecision,
  PolicyDenialCode,
  PolicyEvaluationContext,
  RouteCandidateForPolicy,
} from "./types.js";
import { isRegionAllowed } from "./region-groups.js";

/**
 * Evaluates request-level governance policies before route resolution or provider execution.
 */
export function evaluateRequestPolicy(
  context: PolicyEvaluationContext,
  policy: EffectivePolicy,
): PolicyDecision {
  const reasons: string[] = [];
  const c = policy.constraints;
  const canonicalId = context.canonicalModel.canonicalId.toLowerCase();
  const modelFamily = context.canonicalModel.family?.toLowerCase();
  const modelCategory = context.canonicalModel.category?.toLowerCase();

  // 1. Explicit Model Denylist (Deny overrides allow)
  if (c.deniedModels && c.deniedModels.length > 0) {
    const isDenied = c.deniedModels.some(
      (m) =>
        m.toLowerCase() === canonicalId ||
        canonicalId.startsWith(m.toLowerCase()),
    );
    if (isDenied) {
      return makeDenial(
        "MODEL_DENIED",
        `Model '${context.canonicalModel.canonicalId}' is explicitly denied by governance policy`,
        policy,
      );
    }
  }

  // 2. Model Family Denylist
  if (
    modelFamily &&
    c.deniedModelFamilies &&
    c.deniedModelFamilies.length > 0
  ) {
    if (c.deniedModelFamilies.some((f) => f.toLowerCase() === modelFamily)) {
      return makeDenial(
        "MODEL_FAMILY_DENIED",
        `Model family '${modelFamily}' is denied by governance policy`,
        policy,
      );
    }
  }

  // 3. Model Category Denylist
  if (
    modelCategory &&
    c.deniedModelCategories &&
    c.deniedModelCategories.length > 0
  ) {
    if (
      c.deniedModelCategories.some((cat) => cat.toLowerCase() === modelCategory)
    ) {
      return makeDenial(
        "MODEL_CATEGORY_DENIED",
        `Model category '${modelCategory}' is denied by governance policy`,
        policy,
      );
    }
  }

  // 4. Model Allowlist (if set, canonicalId must match)
  if (c.allowedModels && c.allowedModels.length > 0) {
    const isAllowed = c.allowedModels.some(
      (m) =>
        m.toLowerCase() === canonicalId ||
        canonicalId.startsWith(m.toLowerCase()),
    );
    if (!isAllowed) {
      return makeDenial(
        "MODEL_DENIED",
        `Model '${context.canonicalModel.canonicalId}' is not in the approved model allowlist [${c.allowedModels.join(", ")}]`,
        policy,
      );
    }
  }

  // 5. Model Family Allowlist
  if (
    modelFamily &&
    c.allowedModelFamilies &&
    c.allowedModelFamilies.length > 0
  ) {
    if (!c.allowedModelFamilies.some((f) => f.toLowerCase() === modelFamily)) {
      return makeDenial(
        "MODEL_FAMILY_DENIED",
        `Model family '${modelFamily}' is not in the approved model family allowlist`,
        policy,
      );
    }
  }

  // 6. Model Category Allowlist
  if (
    modelCategory &&
    c.allowedModelCategories &&
    c.allowedModelCategories.length > 0
  ) {
    if (
      !c.allowedModelCategories.some(
        (cat) => cat.toLowerCase() === modelCategory,
      )
    ) {
      return makeDenial(
        "MODEL_CATEGORY_DENIED",
        `Model category '${modelCategory}' is not in the approved category allowlist`,
        policy,
      );
    }
  }

  // 7. Modality Governance
  const inputMods = context.inputModalities ?? ["text"];
  if (c.deniedInputModalities && c.deniedInputModalities.length > 0) {
    for (const mod of inputMods) {
      if (
        c.deniedInputModalities.some(
          (dm) => dm.toLowerCase() === mod.toLowerCase(),
        )
      ) {
        return makeDenial(
          "MODALITY_DENIED",
          `Input modality '${mod}' is prohibited by governance policy`,
          policy,
        );
      }
    }
  }
  if (c.allowedInputModalities && c.allowedInputModalities.length > 0) {
    for (const mod of inputMods) {
      if (
        !c.allowedInputModalities.some(
          (am) => am.toLowerCase() === mod.toLowerCase(),
        )
      ) {
        return makeDenial(
          "MODALITY_DENIED",
          `Input modality '${mod}' is not in approved input modalities [${c.allowedInputModalities.join(", ")}]`,
          policy,
        );
      }
    }
  }

  const outputMods = context.outputModalities ?? ["text"];
  if (c.deniedOutputModalities && c.deniedOutputModalities.length > 0) {
    for (const mod of outputMods) {
      if (
        c.deniedOutputModalities.some(
          (dm) => dm.toLowerCase() === mod.toLowerCase(),
        )
      ) {
        return makeDenial(
          "MODALITY_DENIED",
          `Output modality '${mod}' is prohibited by governance policy`,
          policy,
        );
      }
    }
  }

  // 8. Tool Governance
  const tools = context.tools ?? [];
  if (tools.length > 0) {
    if (c.toolsAllowed === false) {
      return makeDenial(
        "TOOLS_DENIED",
        "Function/tool calling is disabled by governance policy for this workspace",
        policy,
      );
    }

    if (c.maxToolCount !== undefined && tools.length > c.maxToolCount) {
      return makeDenial(
        "REQUEST_LIMIT_DENIED",
        `Request contains ${tools.length} tools which exceeds the maximum allowed tool count of ${c.maxToolCount}`,
        policy,
      );
    }

    if (context.parallelToolCalls && c.parallelToolsAllowed === false) {
      return makeDenial(
        "TOOLS_DENIED",
        "Parallel tool calls are prohibited by governance policy",
        policy,
      );
    }

    // Individual tool name filtering
    for (const t of tools) {
      const rawName = (t as any).function?.name ?? (t as any).name ?? "";
      const toolName = String(rawName).trim().toLowerCase();
      if (!toolName) continue;

      if (
        c.deniedToolNames &&
        c.deniedToolNames.some((dn) => dn.toLowerCase() === toolName)
      ) {
        return makeDenial(
          "TOOL_DENIED",
          `Tool '${rawName}' is explicitly denied by tool policy`,
          policy,
        );
      }

      if (
        c.allowedToolNames &&
        c.allowedToolNames.length > 0 &&
        !c.allowedToolNames.some((an) => an.toLowerCase() === toolName)
      ) {
        return makeDenial(
          "TOOL_DENIED",
          `Tool '${rawName}' is not in the approved tool allowlist [${c.allowedToolNames.join(", ")}]`,
          policy,
        );
      }
    }
  }

  // 9. Structured Output Governance
  if (context.structuredOutput) {
    if (c.structuredOutputAllowed === false) {
      return makeDenial(
        "STRUCTURED_OUTPUT_DENIED",
        "Structured outputs / JSON schemas are prohibited by governance policy",
        policy,
      );
    }
  }

  // 10. Reasoning Governance
  if (context.reasoning) {
    if (c.reasoningAllowed === false) {
      return makeDenial(
        "REASONING_DENIED",
        "Extended reasoning / chain-of-thought is prohibited by governance policy",
        policy,
      );
    }

    if (
      c.maxReasoningTokens !== undefined &&
      context.reasoning.maxTokens !== undefined &&
      context.reasoning.maxTokens > c.maxReasoningTokens
    ) {
      return makeDenial(
        "REQUEST_LIMIT_DENIED",
        `Requested reasoning token budget (${context.reasoning.maxTokens}) exceeds policy limit (${c.maxReasoningTokens})`,
        policy,
      );
    }
  }

  // 11. Request Constraints (Max output tokens, temperature)
  if (
    c.maxOutputTokens !== undefined &&
    context.maxTokens !== undefined &&
    context.maxTokens > c.maxOutputTokens
  ) {
    return makeDenial(
      "REQUEST_LIMIT_DENIED",
      `Requested max_tokens (${context.maxTokens}) exceeds workspace policy ceiling of ${c.maxOutputTokens}`,
      policy,
    );
  }

  if (context.temperature !== undefined) {
    if (
      c.temperatureMin !== undefined &&
      context.temperature < c.temperatureMin
    ) {
      return makeDenial(
        "REQUEST_LIMIT_DENIED",
        `Requested temperature ${context.temperature} is below policy minimum ${c.temperatureMin}`,
        policy,
      );
    }
    if (
      c.temperatureMax !== undefined &&
      context.temperature > c.temperatureMax
    ) {
      return makeDenial(
        "REQUEST_LIMIT_DENIED",
        `Requested temperature ${context.temperature} exceeds policy maximum ${c.temperatureMax}`,
        policy,
      );
    }
  }

  // 12. Data Classification Governance
  if (context.dataClassification) {
    if (
      c.deniedDataClassifications &&
      c.deniedDataClassifications.includes(context.dataClassification)
    ) {
      return makeDenial(
        "DATA_POLICY_DENIED",
        `Data classification '${context.dataClassification}' is prohibited by data handling policy`,
        policy,
      );
    }

    if (
      c.allowedDataClassifications &&
      c.allowedDataClassifications.length > 0 &&
      !c.allowedDataClassifications.includes(context.dataClassification)
    ) {
      return makeDenial(
        "DATA_POLICY_DENIED",
        `Data classification '${context.dataClassification}' is not permitted under allowed classifications [${c.allowedDataClassifications.join(", ")}]`,
        policy,
      );
    }
  }

  // Allow
  return {
    allowed: true,
    policyVersionSet: policy.policyVersions,
    versionHash: policy.versionHash,
    reasons: ["Request satisfies all applicable governance policies"],
    constraints: policy.constraints,
    evaluatedAt: new Date(),
  };
}

/**
 * Evaluates candidate route governance (provider allow/deny, region, data residency, tags, cost).
 */
export function evaluateRoutePolicy(
  candidate: RouteCandidateForPolicy,
  context: PolicyEvaluationContext,
  policy: EffectivePolicy,
): { allowed: boolean; reason?: string; code?: PolicyDenialCode } {
  const c = policy.constraints;
  const providerId = candidate.providerId.toLowerCase();

  // 1. Explicit Provider Denylist (Deny overrides allow)
  if (c.deniedProviders && c.deniedProviders.length > 0) {
    if (c.deniedProviders.some((p) => p.toLowerCase() === providerId)) {
      return {
        allowed: false,
        reason: `Provider '${candidate.providerId}' is explicitly denied by provider governance policy`,
        code: "PROVIDER_DENIED",
      };
    }
  }

  // 2. Provider Allowlist
  if (c.allowedProviders && c.allowedProviders.length > 0) {
    if (!c.allowedProviders.some((p) => p.toLowerCase() === providerId)) {
      return {
        allowed: false,
        reason: `Provider '${candidate.providerId}' is not in approved provider allowlist [${c.allowedProviders.join(", ")}]`,
        code: "PROVIDER_DENIED",
      };
    }
  }

  // 3. Regional & Data Residency Constraints
  const regionRes = isRegionAllowed(candidate.region, {
    allowedRegions: c.allowedRegions,
    deniedRegions: c.deniedRegions,
    requiredDataResidency: c.requiredDataResidency,
  });

  if (!regionRes.allowed) {
    return {
      allowed: false,
      reason: regionRes.reason ?? "Region not permitted by governance policy",
      code: regionRes.code ?? "REGION_DENIED",
    };
  }

  // 4. Required Provider Tags / Compliance Tags
  if (c.requiredProviderTags && c.requiredProviderTags.length > 0) {
    const candidateTags = [
      ...(candidate.tags ?? []),
      ...(candidate.complianceTags ?? []),
    ].map((t) => t.toLowerCase());

    for (const requiredTag of c.requiredProviderTags) {
      if (!candidateTags.includes(requiredTag.toLowerCase())) {
        return {
          allowed: false,
          reason: `Provider route '${candidate.routeId}' lacks required governance tag '${requiredTag}'`,
          code: "PROVIDER_TAG_DENIED",
        };
      }
    }
  }

  // 5. Cost Policy Ceilings
  if (c.maxEstimatedCostPerRequest !== undefined) {
    if (candidate.estimatedCost === undefined) {
      // Safe fail behavior on unknown cost with hard ceiling
      return {
        allowed: false,
        reason: `Route '${candidate.routeId}' pricing is unknown and cannot be verified against cost ceiling of $${c.maxEstimatedCostPerRequest}`,
        code: "COST_POLICY_DENIED",
      };
    }

    if (candidate.estimatedCost > c.maxEstimatedCostPerRequest) {
      return {
        allowed: false,
        reason: `Estimated provider cost ($${candidate.estimatedCost}) exceeds policy ceiling of $${c.maxEstimatedCostPerRequest}`,
        code: "COST_POLICY_DENIED",
      };
    }
  }

  return { allowed: true };
}

/**
 * Batch evaluates candidate routes against governance policy.
 */
export function evaluateRoutesBatch(
  candidates: RouteCandidateForPolicy[],
  context: PolicyEvaluationContext,
  policy: EffectivePolicy,
): BatchRoutePolicyEvaluationResult {
  const eligible: RouteCandidateForPolicy[] = [];
  const excluded: Array<{
    candidate: RouteCandidateForPolicy;
    reason: string;
    denialCode: PolicyDenialCode;
  }> = [];

  for (const candidate of candidates) {
    const res = evaluateRoutePolicy(candidate, context, policy);
    if (res.allowed) {
      eligible.push(candidate);
    } else {
      excluded.push({
        candidate,
        reason: res.reason ?? "Denied by governance policy",
        denialCode: res.code ?? "PROVIDER_DENIED",
      });
    }
  }

  return { eligible, excluded };
}

function makeDenial(
  code: PolicyDenialCode,
  reason: string,
  policy: EffectivePolicy,
): PolicyDecision {
  return {
    allowed: false,
    policyVersionSet: policy.policyVersions,
    versionHash: policy.versionHash,
    reasons: [reason],
    denialCode: code,
    constraints: policy.constraints,
    evaluatedAt: new Date(),
  };
}
