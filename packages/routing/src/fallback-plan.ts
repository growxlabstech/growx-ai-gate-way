import type {
  RankedCandidateRecord,
  RoutingPlan,
  RoutingObjective,
} from "@growx/contracts";

export interface BuildFallbackPlanInput {
  rankedCandidates: RankedCandidateRecord[];
  policyVersion?: number | undefined;
  objective?: RoutingObjective | undefined;
  requestProfileHash: string;
}

export class FallbackPlanBuilder {
  public static buildPlan(input: BuildFallbackPlanInput): RoutingPlan {
    const { rankedCandidates, policyVersion = 1, objective = "balanced", requestProfileHash } = input;
    if (rankedCandidates.length === 0) {
      throw new Error("Cannot build fallback plan from empty candidate list");
    }

    const selectedCandidate = rankedCandidates[0]!;
    const fallbacks = rankedCandidates.slice(1);

    return {
      selectedRouteId: selectedCandidate.routeId,
      selectedCandidate,
      fallbacks,
      policyVersion,
      objective,
      requestProfileHash,
      routerVersion: "v2",
    };
  }

  /**
   * Filter fallback candidate list by isolating failure domains:
   * - 401 / 403: excludes correlated credential failure domain (same credentialId or providerAccountId)
   * - 429: excludes correlated account capacity failure domain (same providerAccountId or accountPoolId)
   * - 5xx: excludes entire provider failure domain (same providerId)
   */
  public static getNextFallback(
    plan: RoutingPlan,
    failedAttempts: {
      routeId: string;
      providerId: string;
      providerAccountId?: string | undefined;
      credentialId?: string | undefined;
      statusCode?: number | undefined;
    }[]
  ): RankedCandidateRecord | null {
    const failedRouteIds = new Set(failedAttempts.map(a => a.routeId));

    const failedCredentials = new Set(
      failedAttempts
        .filter(a => a.statusCode === 401 || a.statusCode === 403)
        .map(a => a.credentialId)
        .filter(Boolean)
    );

    const failedAccounts = new Set(
      failedAttempts
        .filter(a => a.statusCode === 429)
        .map(a => a.providerAccountId)
        .filter(Boolean)
    );

    const failedAuthProviders = new Set(
      failedAttempts
        .filter(a => (a.statusCode === 401 || a.statusCode === 403) && !a.credentialId)
        .map(a => a.providerId)
    );

    const failedOutageProviders = new Set(
      failedAttempts.filter(a => a.statusCode && a.statusCode >= 500).map(a => a.providerId)
    );

    for (const candidate of plan.fallbacks) {
      if (failedRouteIds.has(candidate.routeId)) {
        continue;
      }
      if (candidate.failureDomain?.credentialId && failedCredentials.has(candidate.failureDomain.credentialId)) {
        continue;
      }
      if (candidate.failureDomain?.accountPoolId && failedAccounts.has(candidate.failureDomain.accountPoolId)) {
        continue;
      }
      if (failedAuthProviders.has(candidate.providerId)) {
        continue;
      }
      if (failedOutageProviders.has(candidate.providerId)) {
        continue;
      }
      return candidate;
    }

    // Fallback: If no isolated domain candidate exists, pick next non-failed route ID
    return plan.fallbacks.find(c => !failedRouteIds.has(c.routeId)) ?? null;
  }
}
