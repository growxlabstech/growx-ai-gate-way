export const STANDARD_REGION_GROUPS: Record<string, string[]> = {
  EU: [
    "eu",
    "eu-west-1",
    "eu-west-2",
    "eu-west-3",
    "eu-central-1",
    "eu-central-2",
    "eu-north-1",
    "eu-south-1",
    "eu-south-2",
    "europe-west1",
    "europe-west2",
    "europe-west3",
    "europe-west4",
    "europe-west6",
    "europe-west9",
    "europe-north1",
    "europe-central2",
  ],
  US: [
    "us",
    "us-east-1",
    "us-east-2",
    "us-west-1",
    "us-west-2",
    "us-central1",
    "us-east4",
    "us-west4",
  ],
  APAC: [
    "apac",
    "ap-southeast-1",
    "ap-southeast-2",
    "ap-southeast-3",
    "ap-northeast-1",
    "ap-northeast-2",
    "ap-northeast-3",
    "ap-east-1",
    "asia-east1",
    "asia-east2",
    "asia-northeast1",
    "asia-northeast2",
    "asia-northeast3",
    "asia-southeast1",
    "asia-southeast2",
  ],
  IN: [
    "in",
    "india",
    "ap-south-1",
    "ap-south-2",
    "asia-south1",
    "asia-south2",
  ],
  GLOBAL: ["global"],
};

/**
 * Expands a region identifier or region group into all matching discrete region names.
 */
export function expandRegionOrGroup(identifier: string): string[] {
  const upper = identifier.toUpperCase();
  if (STANDARD_REGION_GROUPS[upper]) {
    return STANDARD_REGION_GROUPS[upper];
  }
  return [identifier.toLowerCase()];
}

/**
 * Checks if a candidate region matches a target region or region group.
 */
export function regionMatches(candidateRegion: string, targetRegionOrGroup: string): boolean {
  const normCandidate = candidateRegion.toLowerCase();
  const upperTarget = targetRegionOrGroup.toUpperCase();

  if (STANDARD_REGION_GROUPS[upperTarget]) {
    return STANDARD_REGION_GROUPS[upperTarget].includes(normCandidate);
  }

  const normTarget = targetRegionOrGroup.toLowerCase();
  return normCandidate === normTarget || normTarget === "global" || normCandidate === "global";
}

/**
 * Evaluates whether a candidate region is allowed under regional allow/deny and data residency constraints.
 */
export function isRegionAllowed(
  candidateRegion: string | undefined,
  options: {
    allowedRegions?: string[] | undefined;
    deniedRegions?: string[] | undefined;
    requiredDataResidency?: string | undefined;
  }
): { allowed: boolean; reason?: string; code?: "REGION_DENIED" | "DATA_RESIDENCY_DENIED" } {
  const reg = candidateRegion ? candidateRegion.toLowerCase() : "global";

  // 1. Explicit deny list (Deny overrides allow)
  if (options.deniedRegions && options.deniedRegions.length > 0) {
    for (const denied of options.deniedRegions) {
      if (regionMatches(reg, denied)) {
        return {
          allowed: false,
          reason: `Region '${reg}' is explicitly denied by regional governance policy (matches '${denied}')`,
          code: "REGION_DENIED",
        };
      }
    }
  }

  // 2. Data residency requirement
  if (options.requiredDataResidency) {
    if (!regionMatches(reg, options.requiredDataResidency)) {
      return {
        allowed: false,
        reason: `Region '${reg}' does not satisfy required data residency '${options.requiredDataResidency}'`,
        code: "DATA_RESIDENCY_DENIED",
      };
    }
  }

  // 3. Allowed list (if specified, region must match at least one allowed entry)
  if (options.allowedRegions && options.allowedRegions.length > 0) {
    const isAllowed = options.allowedRegions.some((allowed) => regionMatches(reg, allowed));
    if (!isAllowed) {
      return {
        allowed: false,
        reason: `Region '${reg}' is not in approved regional allowlist [${options.allowedRegions.join(", ")}]`,
        code: "REGION_DENIED",
      };
    }
  }

  return { allowed: true };
}
