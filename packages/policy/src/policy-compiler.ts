import { createHash } from "node:crypto";
import type {
  DataClassification,
  EffectivePolicy,
  EffectivePolicyConstraints,
  PolicyDefinition,
  PolicyRule,
  PolicyScopeType,
  PolicyVersionEntity,
} from "./types.js";

export interface PolicyHierarchyItem {
  scopeType: PolicyScopeType;
  scopeId?: string | null | undefined;
  policyId: string;
  version: number;
  definition: PolicyDefinition;
}

/**
 * Intersects two string arrays. If current is undefined, returns target.
 */
function intersectSets(
  current: string[] | undefined,
  target: string[],
): string[] {
  if (current === undefined) {
    return [...target];
  }
  const targetSet = new Set(target.map((s) => s.toLowerCase()));
  return current.filter((item) => targetSet.has(item.toLowerCase()));
}

/**
 * Unions items into an array without duplicates.
 */
function unionSets(current: string[] | undefined, target: string[]): string[] {
  const set = new Set((current ?? []).map((s) => s.toLowerCase()));
  for (const t of target) {
    set.add(t.toLowerCase());
  }
  return Array.from(set);
}

/**
 * Compiles multiple policy versions across hierarchical scopes
 * (Global -> Organization -> Workspace -> API Key) into a single EffectivePolicy.
 *
 * Rules:
 * - Deny overrides Allow: All explicit deny rules are unioned across scopes.
 * - Allow restrictions are intersected across scopes (narrowing only).
 * - Numeric ceilings: Strictest (lowest) bound wins.
 * - Feature permissions (tools, reasoning, structured output): Any false/deny overrides true/allow.
 */
export function compileEffectivePolicy(
  hierarchy: PolicyHierarchyItem[],
  requestConstraints?: Partial<EffectivePolicyConstraints>,
): EffectivePolicy {
  const policyVersions: Record<string, number> = {};
  const allRules: PolicyRule[] = [];

  const constraints: EffectivePolicyConstraints = {};

  // Sort hierarchy in canonical precedence: global -> organization -> workspace -> api_key
  const precedenceOrder: Record<PolicyScopeType, number> = {
    global: 0,
    organization: 1,
    workspace: 2,
    api_key: 3,
  };

  const sortedHierarchy = [...hierarchy].sort(
    (a, b) => precedenceOrder[a.scopeType] - precedenceOrder[b.scopeType],
  );

  for (const item of sortedHierarchy) {
    policyVersions[item.policyId] = item.version;

    for (const rule of item.definition.rules) {
      allRules.push(rule);
      const val = rule.value;

      switch (rule.target) {
        case "model": {
          const models = Array.isArray(val) ? val.map(String) : [String(val)];
          if (rule.effect === "deny") {
            constraints.deniedModels = unionSets(
              constraints.deniedModels,
              models,
            );
          } else {
            constraints.allowedModels = intersectSets(
              constraints.allowedModels,
              models,
            );
          }
          break;
        }

        case "model_family": {
          const families = Array.isArray(val) ? val.map(String) : [String(val)];
          if (rule.effect === "deny") {
            constraints.deniedModelFamilies = unionSets(
              constraints.deniedModelFamilies,
              families,
            );
          } else {
            constraints.allowedModelFamilies = intersectSets(
              constraints.allowedModelFamilies,
              families,
            );
          }
          break;
        }

        case "model_category": {
          const cats = Array.isArray(val) ? val.map(String) : [String(val)];
          if (rule.effect === "deny") {
            constraints.deniedModelCategories = unionSets(
              constraints.deniedModelCategories,
              cats,
            );
          } else {
            constraints.allowedModelCategories = intersectSets(
              constraints.allowedModelCategories,
              cats,
            );
          }
          break;
        }

        case "provider": {
          const providers = Array.isArray(val)
            ? val.map(String)
            : [String(val)];
          if (rule.effect === "deny") {
            constraints.deniedProviders = unionSets(
              constraints.deniedProviders,
              providers,
            );
          } else {
            constraints.allowedProviders = intersectSets(
              constraints.allowedProviders,
              providers,
            );
          }
          break;
        }

        case "region": {
          const regions = Array.isArray(val) ? val.map(String) : [String(val)];
          if (rule.effect === "deny") {
            constraints.deniedRegions = unionSets(
              constraints.deniedRegions,
              regions,
            );
          } else {
            constraints.allowedRegions = intersectSets(
              constraints.allowedRegions,
              regions,
            );
          }
          break;
        }

        case "data_residency": {
          if (rule.effect === "deny") {
            constraints.deniedRegions = unionSets(
              constraints.deniedRegions,
              Array.isArray(val) ? val.map(String) : [String(val)],
            );
          } else {
            // Most specific required data residency wins
            constraints.requiredDataResidency = String(val);
          }
          break;
        }

        case "provider_tag": {
          const tags = Array.isArray(val) ? val.map(String) : [String(val)];
          if (
            rule.effect === "allow" ||
            rule.operator === "in" ||
            rule.operator === "equals"
          ) {
            constraints.requiredProviderTags = unionSets(
              constraints.requiredProviderTags,
              tags,
            );
          }
          break;
        }

        case "input_modality": {
          const mods = Array.isArray(val) ? val.map(String) : [String(val)];
          if (rule.effect === "deny") {
            constraints.deniedInputModalities = unionSets(
              constraints.deniedInputModalities,
              mods,
            );
          } else {
            constraints.allowedInputModalities = intersectSets(
              constraints.allowedInputModalities,
              mods,
            );
          }
          break;
        }

        case "output_modality": {
          const mods = Array.isArray(val) ? val.map(String) : [String(val)];
          if (rule.effect === "deny") {
            constraints.deniedOutputModalities = unionSets(
              constraints.deniedOutputModalities,
              mods,
            );
          } else {
            constraints.allowedOutputModalities = intersectSets(
              constraints.allowedOutputModalities,
              mods,
            );
          }
          break;
        }

        case "tools": {
          const allowed = Boolean(val);
          if (rule.effect === "deny" || !allowed) {
            constraints.toolsAllowed = false;
          } else if (constraints.toolsAllowed === undefined) {
            constraints.toolsAllowed = true;
          }
          break;
        }

        case "tool_name": {
          const toolNames = Array.isArray(val)
            ? val.map(String)
            : [String(val)];
          if (rule.effect === "deny") {
            constraints.deniedToolNames = unionSets(
              constraints.deniedToolNames,
              toolNames,
            );
          } else {
            constraints.allowedToolNames = intersectSets(
              constraints.allowedToolNames,
              toolNames,
            );
          }
          break;
        }

        case "max_tools": {
          const num = Number(val);
          if (!isNaN(num)) {
            constraints.maxToolCount =
              constraints.maxToolCount !== undefined
                ? Math.min(constraints.maxToolCount, num)
                : num;
          }
          break;
        }

        case "parallel_tools": {
          const allowed = Boolean(val);
          if (rule.effect === "deny" || !allowed) {
            constraints.parallelToolsAllowed = false;
          } else if (constraints.parallelToolsAllowed === undefined) {
            constraints.parallelToolsAllowed = true;
          }
          break;
        }

        case "structured_output": {
          const allowed = Boolean(val);
          if (rule.effect === "deny" || !allowed) {
            constraints.structuredOutputAllowed = false;
          } else if (constraints.structuredOutputAllowed === undefined) {
            constraints.structuredOutputAllowed = true;
          }
          break;
        }

        case "reasoning": {
          const allowed = Boolean(val);
          if (rule.effect === "deny" || !allowed) {
            constraints.reasoningAllowed = false;
          } else if (constraints.reasoningAllowed === undefined) {
            constraints.reasoningAllowed = true;
          }
          break;
        }

        case "max_reasoning_tokens": {
          const num = Number(val);
          if (!isNaN(num)) {
            constraints.maxReasoningTokens =
              constraints.maxReasoningTokens !== undefined
                ? Math.min(constraints.maxReasoningTokens, num)
                : num;
          }
          break;
        }

        case "max_output_tokens": {
          const num = Number(val);
          if (!isNaN(num)) {
            constraints.maxOutputTokens =
              constraints.maxOutputTokens !== undefined
                ? Math.min(constraints.maxOutputTokens, num)
                : num;
          }
          break;
        }

        case "max_cost_per_request": {
          const num = Number(val);
          if (!isNaN(num)) {
            constraints.maxEstimatedCostPerRequest =
              constraints.maxEstimatedCostPerRequest !== undefined
                ? Math.min(constraints.maxEstimatedCostPerRequest, num)
                : num;
          }
          break;
        }

        case "data_classification": {
          const classes = (
            Array.isArray(val) ? val : [val]
          ) as DataClassification[];
          if (rule.effect === "deny") {
            const currentDenied = constraints.deniedDataClassifications ?? [];
            constraints.deniedDataClassifications = Array.from(
              new Set([...currentDenied, ...classes]),
            );
          } else {
            const currentAllowed = constraints.allowedDataClassifications;
            constraints.allowedDataClassifications = currentAllowed
              ? currentAllowed.filter((c) => classes.includes(c))
              : [...classes];
          }
          break;
        }
      }
    }
  }

  // Apply optional ad-hoc request constraints (narrowing only)
  if (requestConstraints) {
    if (requestConstraints.deniedModels) {
      constraints.deniedModels = unionSets(
        constraints.deniedModels,
        requestConstraints.deniedModels,
      );
    }
    if (requestConstraints.allowedModels) {
      constraints.allowedModels = intersectSets(
        constraints.allowedModels,
        requestConstraints.allowedModels,
      );
    }
    if (requestConstraints.deniedProviders) {
      constraints.deniedProviders = unionSets(
        constraints.deniedProviders,
        requestConstraints.deniedProviders,
      );
    }
    if (requestConstraints.allowedProviders) {
      constraints.allowedProviders = intersectSets(
        constraints.allowedProviders,
        requestConstraints.allowedProviders,
      );
    }
    if (requestConstraints.deniedRegions) {
      constraints.deniedRegions = unionSets(
        constraints.deniedRegions,
        requestConstraints.deniedRegions,
      );
    }
    if (requestConstraints.allowedRegions) {
      constraints.allowedRegions = intersectSets(
        constraints.allowedRegions,
        requestConstraints.allowedRegions,
      );
    }
    if (requestConstraints.requiredDataResidency) {
      constraints.requiredDataResidency =
        requestConstraints.requiredDataResidency;
    }
    if (requestConstraints.maxEstimatedCostPerRequest !== undefined) {
      constraints.maxEstimatedCostPerRequest =
        constraints.maxEstimatedCostPerRequest !== undefined
          ? Math.min(
              constraints.maxEstimatedCostPerRequest,
              requestConstraints.maxEstimatedCostPerRequest,
            )
          : requestConstraints.maxEstimatedCostPerRequest;
    }
  }

  // Compute version hash
  const versionString = Object.entries(policyVersions)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, ver]) => `${id}:${ver}`)
    .join(";");

  const versionHash = createHash("sha256")
    .update(versionString || "empty_policy")
    .digest("hex")
    .slice(0, 16);

  return {
    versionHash,
    policyVersions,
    rules: allRules,
    constraints,
    compiledAt: new Date(),
  };
}
