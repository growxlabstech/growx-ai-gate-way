import type { MachineAuthContext, ModelRule } from "@growx/contracts";
import type { ModelCategory } from "@growx/contracts";

function matchPattern(pattern: string, target: string): boolean {
  if (pattern === "*" || pattern === target) {
    return true;
  }
  // Convert glob pattern to regular expression (e.g. openai/* -> ^openai\/.*$)
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  const regex = new RegExp(`^${escaped}$`, "i");
  return regex.test(target);
}

export function isCanonicalModelAllowedByKey(
  machineContext: Pick<MachineAuthContext, "modelRules">,
  canonicalModelId: string,
  category?: ModelCategory
): { allowed: boolean; reason?: string } {
  const rules = machineContext.modelRules;
  if (!rules || rules.length === 0) {
    return { allowed: true };
  }

  // 1. Evaluate explicit DENY rules first (Strictest Applicable Limit / Deny-Override)
  for (const rule of rules) {
    if (rule.effect === "deny") {
      if (matchPattern(rule.pattern, canonicalModelId)) {
        if (!rule.category || rule.category === category) {
          return {
            allowed: false,
            reason: `Access to model '${canonicalModelId}' denied by API key rule pattern '${rule.pattern}'`,
          };
        }
      }
    }
  }

  // 2. Evaluate ALLOW rules
  const allowRules = rules.filter((r) => r.effect === "allow");
  if (allowRules.length === 0) {
    // If there are only deny rules and none matched, allow by default
    return { allowed: true };
  }

  for (const rule of allowRules) {
    if (matchPattern(rule.pattern, canonicalModelId)) {
      if (!rule.category || rule.category === category) {
        return { allowed: true };
      }
    }
  }

  // If allow rules exist but none matched the model, deny access
  return {
    allowed: false,
    reason: `Model '${canonicalModelId}' is not included in the API key allowed models list`,
  };
}
