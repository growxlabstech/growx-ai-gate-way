import type {
  PolicyVersion,
  RoutingConstraints,
  RoutingPolicy,
  ScoreWeights,
} from "./types.js";
import {
  DEFAULT_WEIGHTS,
  normalizeWeights,
  validateWeights,
} from "./scoring.js";

export const DEFAULT_GLOBAL_POLICY: RoutingPolicy = {
  id: "pol_global_default",
  organizationId: null,
  workspaceId: null,
  name: "Global Default Routing Policy",
  level: "global",
  strategy: "priority",
  allowedProviders: undefined,
  deniedProviders: undefined,
  allowedRegions: undefined,
  deniedRegions: undefined,
  preferredProviders: undefined,
  maxEstimatedProviderCost: undefined,
  weights: DEFAULT_WEIGHTS,
  sticky: false,
  enabled: true,
  version: 1,
  createdAt: new Date(0),
  updatedAt: new Date(0),
};

/**
 * Merge multiple routing policies according to strict precedence rules:
 * Global -> Organization -> Workspace -> API Key -> Request.
 *
 * Rules:
 * - Most specific non-empty configuration wins for strategy, weights, sticky flag.
 * - Denied providers / regions at any level are merged (union) — deny strictly overrides allow!
 * - Allowed providers / regions are intersected across levels.
 * - Data residency / required region from the most specific level wins.
 * - Maximum cost limit: strictest (lowest) limit wins.
 */
export function mergeRoutingPolicies(
  policies: Array<RoutingPolicy | undefined | null>,
  constraints?: RoutingConstraints | undefined,
): RoutingPolicy {
  const activePolicies = policies.filter(
    (p): p is RoutingPolicy =>
      p !== undefined && p !== null && p.enabled !== false,
  );

  let merged: RoutingPolicy = {
    ...DEFAULT_GLOBAL_POLICY,
    weights: { ...DEFAULT_WEIGHTS },
    version: 1,
  };

  const allDeniedProviders = new Set<string>();
  let allowedProviders: Set<string> | null = null;

  const allDeniedRegions = new Set<string>();
  let allowedRegions: Set<string> | null = null;
  let requiredRegion: string | undefined = undefined;
  let maxCost: number | undefined = undefined;

  for (const pol of activePolicies) {
    if (pol.strategy) {
      merged.strategy = pol.strategy;
    }
    if (pol.weights) {
      merged.weights = normalizeWeights(pol.weights);
    }
    if (pol.sticky !== undefined) {
      merged.sticky = pol.sticky;
    }
    if (pol.version !== undefined) {
      merged.version = pol.version;
    }
    if (pol.id) {
      merged.id = pol.id;
    }

    // Denied providers: union
    if (pol.deniedProviders && pol.deniedProviders.length > 0) {
      for (const p of pol.deniedProviders) allDeniedProviders.add(p);
    }

    // Allowed providers: intersection
    if (pol.allowedProviders && pol.allowedProviders.length > 0) {
      if (allowedProviders === null) {
        allowedProviders = new Set<string>(pol.allowedProviders);
      } else {
        const currentAllowed: Set<string> = allowedProviders;
        allowedProviders = new Set<string>(
          [...currentAllowed].filter((p: string) =>
            pol.allowedProviders!.includes(p),
          ),
        );
      }
    }

    // Denied regions: union
    if (pol.deniedRegions && pol.deniedRegions.length > 0) {
      for (const r of pol.deniedRegions) allDeniedRegions.add(r);
    }

    // Allowed regions: intersection
    if (pol.allowedRegions && pol.allowedRegions.length > 0) {
      if (allowedRegions === null) {
        allowedRegions = new Set<string>(pol.allowedRegions);
      } else {
        const currentAllowedRegions: Set<string> = allowedRegions;
        allowedRegions = new Set<string>(
          [...currentAllowedRegions].filter((r: string) =>
            pol.allowedRegions!.includes(r),
          ),
        );
      }
    }

    if (pol.requiredRegion || pol.dataRegion) {
      requiredRegion = pol.requiredRegion ?? pol.dataRegion;
    }

    if (pol.maxEstimatedProviderCost !== undefined) {
      maxCost =
        maxCost !== undefined
          ? Math.min(maxCost, pol.maxEstimatedProviderCost)
          : pol.maxEstimatedProviderCost;
    }

    if (pol.providerPriorities) {
      merged.providerPriorities = {
        ...merged.providerPriorities,
        ...pol.providerPriorities,
      };
    }
    if (pol.providerWeights) {
      merged.providerWeights = {
        ...merged.providerWeights,
        ...pol.providerWeights,
      };
    }
  }

  // Apply request constraints if present
  if (constraints) {
    if (constraints.deniedProviders) {
      for (const p of constraints.deniedProviders) allDeniedProviders.add(p);
    }
    if (
      constraints.allowedProviders &&
      constraints.allowedProviders.length > 0
    ) {
      if (allowedProviders === null) {
        allowedProviders = new Set<string>(constraints.allowedProviders);
      } else {
        const currentAllowed: Set<string> = allowedProviders;
        allowedProviders = new Set<string>(
          [...currentAllowed].filter((p: string) =>
            constraints.allowedProviders!.includes(p),
          ),
        );
      }
    }
    if (constraints.deniedRegions) {
      for (const r of constraints.deniedRegions) allDeniedRegions.add(r);
    }
    if (constraints.allowedRegions && constraints.allowedRegions.length > 0) {
      if (allowedRegions === null) {
        allowedRegions = new Set<string>(constraints.allowedRegions);
      } else {
        const currentAllowedRegions: Set<string> = allowedRegions;
        allowedRegions = new Set<string>(
          [...currentAllowedRegions].filter((r: string) =>
            constraints.allowedRegions!.includes(r),
          ),
        );
      }
    }
    if (
      constraints.requiredRegion ||
      constraints.dataRegion ||
      constraints.region
    ) {
      requiredRegion =
        constraints.requiredRegion ??
        constraints.dataRegion ??
        constraints.region;
    }
    if (constraints.maxEstimatedProviderCost !== undefined) {
      maxCost =
        maxCost !== undefined
          ? Math.min(maxCost, constraints.maxEstimatedProviderCost)
          : constraints.maxEstimatedProviderCost;
    }
  }

  merged.deniedProviders =
    allDeniedProviders.size > 0 ? Array.from(allDeniedProviders) : undefined;
  merged.allowedProviders =
    allowedProviders !== null ? Array.from(allowedProviders) : undefined;

  merged.deniedRegions =
    allDeniedRegions.size > 0 ? Array.from(allDeniedRegions) : undefined;
  merged.allowedRegions =
    allowedRegions !== null ? Array.from(allowedRegions) : undefined;

  merged.requiredRegion = requiredRegion;
  merged.dataRegion = requiredRegion;
  merged.maxEstimatedProviderCost = maxCost;

  return merged;
}

/** Legacy PolicyVersion resolution preserved for backward compatibility */
export function resolvePolicy(
  versions: readonly PolicyVersion[],
): PolicyVersion {
  const precedence = [
    "global",
    "plan",
    "organization",
    "workspace",
    "environment",
    "apiKey",
    "request",
  ] as const;
  const active = versions.filter((value) => value.status === "active");
  const selected = active.sort(
    (a, b) =>
      precedence.indexOf(b.level) - precedence.indexOf(a.level) ||
      b.version - a.version,
  )[0];
  if (!selected) throw new Error("No active routing policy");
  validateWeights(selected.weights);
  return selected;
}
