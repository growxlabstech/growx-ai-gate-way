import type {
  Currency,
  ProviderPriceSchedule,
  ProviderRate,
  ProviderScheduleWithRates,
} from "./types.js";

export interface ResolveProviderPriceParams {
  providerId: string;
  providerRouteId?: string | undefined;
  canonicalModelId?: string | undefined;
  providerModelId?: string | undefined;
  region?: string | undefined;
  credentialId?: string | undefined;
  currency?: Currency | undefined;
  targetDate?: Date | undefined;
  scheduleId?: string | undefined;
  version?: number | undefined;
}

export class ProviderPriceResolver {
  private readonly schedules: Map<string, ProviderScheduleWithRates> =
    new Map();

  constructor(initialSchedules?: ProviderScheduleWithRates[]) {
    if (initialSchedules) {
      for (const item of initialSchedules) {
        this.addSchedule(item);
      }
    }
  }

  public addSchedule(item: ProviderScheduleWithRates): void {
    this.validateSchedule(item.schedule);
    this.schedules.set(item.schedule.id, item);
  }

  public removeSchedule(scheduleId: string): void {
    this.schedules.delete(scheduleId);
  }

  public getAllSchedules(): ProviderScheduleWithRates[] {
    return Array.from(this.schedules.values());
  }

  public getScheduleById(id: string): ProviderScheduleWithRates | undefined {
    return this.schedules.get(id);
  }

  /**
   * Resolves the authoritative provider price schedule for a given route/provider/model context.
   * Follows strict precedence:
   * 1. Exact schedule ID and/or version (for historical snapshot reproducibility)
   * 2. Route ID match (if providerRouteId specified)
   * 3. Provider ID + Provider Model ID + Region match
   * 4. Provider ID + Provider Model ID (global / any region)
   * 5. Canonical Model ID + Provider ID
   * 6. Provider ID generic default
   */
  public resolveSchedule(
    params: ResolveProviderPriceParams,
  ): ProviderScheduleWithRates | undefined {
    const targetDate = params.targetDate ?? new Date();

    // 1. Direct snapshot lookup if scheduleId is provided
    if (params.scheduleId) {
      const found = this.schedules.get(params.scheduleId);
      if (found) {
        if (
          params.version !== undefined &&
          found.schedule.version !== params.version
        ) {
          // Version mismatch on direct lookup
          return undefined;
        }
        return found;
      }
      return undefined;
    }

    const activeSchedules = Array.from(this.schedules.values()).filter(
      (item) => {
        const s = item.schedule;
        if (s.providerId.toLowerCase() !== params.providerId.toLowerCase()) {
          return false;
        }
        if (params.currency && s.currency !== params.currency) {
          return false;
        }
        if (s.status !== "active") {
          return false;
        }
        // Check effective dating: [effectiveFrom, effectiveTo)
        const from = s.effectiveFrom.getTime();
        const to = s.effectiveTo ? s.effectiveTo.getTime() : Infinity;
        const target = targetDate.getTime();
        return target >= from && target < to;
      },
    );

    if (activeSchedules.length === 0) {
      return undefined;
    }

    // Sort active candidates by specificity precedence
    const scoredCandidates = activeSchedules
      .map((item) => ({
        item,
        score: this.calculateSpecificityScore(item.schedule, params),
      }))
      .filter((c) => c.score > 0)
      .sort((a, b) => b.score - a.score);

    if (scoredCandidates.length === 0) {
      return undefined;
    }

    // Check for ambiguous equal-precedence conflict
    if (
      scoredCandidates.length > 1 &&
      scoredCandidates[0]!.score === scoredCandidates[1]!.score &&
      scoredCandidates[0]!.item.schedule.id !==
        scoredCandidates[1]!.item.schedule.id
    ) {
      throw new Error(
        `Ambiguous provider pricing schedules detected with identical precedence score (${scoredCandidates[0]!.score}) for provider '${params.providerId}'`,
      );
    }

    return scoredCandidates[0]!.item;
  }

  private calculateSpecificityScore(
    schedule: ProviderPriceSchedule,
    params: ResolveProviderPriceParams,
  ): number {
    let score = 0;

    // 1. Exact Route ID match (Highest: 10,000)
    if (schedule.providerRouteId && params.providerRouteId) {
      if (schedule.providerRouteId === params.providerRouteId) {
        score += 10000;
      } else {
        return 0; // Route ID mismatch
      }
    } else if (schedule.providerRouteId && !params.providerRouteId) {
      return 0; // Schedule requires routeId that caller didn't supply
    }

    // 2. Credential/Account match (5,000)
    if (schedule.credentialId && params.credentialId) {
      if (schedule.credentialId === params.credentialId) {
        score += 5000;
      } else {
        return 0;
      }
    } else if (schedule.credentialId && !params.credentialId) {
      return 0;
    }

    // 3. Provider Model ID match (2,000)
    if (schedule.providerModelId && params.providerModelId) {
      if (
        schedule.providerModelId.toLowerCase() ===
        params.providerModelId.toLowerCase()
      ) {
        score += 2000;
      } else {
        return 0;
      }
    }

    // 4. Region match (1,000)
    if (schedule.region && schedule.region !== "global") {
      if (
        params.region &&
        schedule.region.toLowerCase() === params.region.toLowerCase()
      ) {
        score += 1000;
      } else {
        return 0;
      }
    }

    // 5. Canonical Model ID match (500)
    if (schedule.canonicalModelId && params.canonicalModelId) {
      if (
        schedule.canonicalModelId.toLowerCase() ===
        params.canonicalModelId.toLowerCase()
      ) {
        score += 500;
      }
    }

    // Base provider match score (100)
    score += 100;

    return score;
  }

  private validateSchedule(schedule: ProviderPriceSchedule): void {
    if (!schedule.id || !schedule.providerId) {
      throw new Error("ProviderPriceSchedule must have id and providerId");
    }
    if (
      schedule.effectiveTo &&
      schedule.effectiveTo <= schedule.effectiveFrom
    ) {
      throw new Error(
        `effectiveTo (${schedule.effectiveTo.toISOString()}) must be after effectiveFrom (${schedule.effectiveFrom.toISOString()})`,
      );
    }
    if (schedule.version <= 0) {
      throw new Error("ProviderPriceSchedule version must be positive integer");
    }
  }
}
