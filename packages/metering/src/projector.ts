import type { UsageAggregate, UsageEvent } from "./types.js";

export function getHourlyBucketRange(date: Date): {
  start: Date;
  end: Date;
  key: string;
} {
  const start = new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      date.getUTCHours(),
      0,
      0,
      0,
    ),
  );
  const end = new Date(start.getTime() + 60 * 60 * 1000 - 1);
  const key = `h_${start.toISOString()}`;
  return { start, end, key };
}

export function getDailyBucketRange(date: Date): {
  start: Date;
  end: Date;
  key: string;
} {
  const start = new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      0,
      0,
      0,
      0,
    ),
  );
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
  const key = `d_${start.toISOString()}`;
  return { start, end, key };
}

export function computeAggregateKey(
  bucket: "hourly" | "daily",
  bucketStart: Date,
  orgId: string,
  workspaceId: string,
  apiKeyId?: string,
  modelId?: string,
  providerId?: string,
): string {
  return `${bucket}:${bucketStart.toISOString()}:${orgId}:${workspaceId}:${apiKeyId ?? "all"}:${modelId ?? "all"}:${providerId ?? "all"}`;
}

export class UsageAggregateProjector {
  /**
   * Applies an immutable UsageEvent to an existing or new aggregate.
   */
  public projectEvent(
    aggregate: UsageAggregate,
    event: UsageEvent,
  ): UsageAggregate {
    const qty = event.quantity;

    let inputTokens = aggregate.inputTokens;
    let outputTokens = aggregate.outputTokens;
    let totalTokens = aggregate.totalTokens;
    let cachedInputTokens = aggregate.cachedInputTokens;
    let reasoningTokens = aggregate.reasoningTokens;

    switch (event.usageType) {
      case "input_tokens":
        inputTokens += qty;
        break;
      case "output_tokens":
        outputTokens += qty;
        break;
      case "total_tokens":
        totalTokens += qty;
        break;
      case "cached_input_tokens":
        cachedInputTokens += qty;
        break;
      case "reasoning_tokens":
        reasoningTokens += qty;
        break;
      default:
        break;
    }

    return {
      ...aggregate,
      inputTokens,
      outputTokens,
      totalTokens,
      cachedInputTokens,
      reasoningTokens,
      updatedAt: new Date(),
    };
  }

  /**
   * Rebuilds aggregate map in memory from a collection of raw immutable events.
   */
  public rebuildAggregates(
    events: readonly UsageEvent[],
  ): Map<string, UsageAggregate> {
    const aggregates = new Map<string, UsageAggregate>();

    for (const event of events) {
      // Hourly bucket
      const hourly = getHourlyBucketRange(event.occurredAt);
      const hourlyKey = computeAggregateKey(
        "hourly",
        hourly.start,
        event.organizationId,
        event.workspaceId,
        event.apiKeyId,
        event.canonicalModelId,
        event.providerId,
      );

      let hourlyAgg = aggregates.get(hourlyKey);
      if (!hourlyAgg) {
        hourlyAgg = {
          id: hourlyKey,
          organizationId: event.organizationId,
          workspaceId: event.workspaceId,
          apiKeyId: event.apiKeyId,
          canonicalModelId: event.canonicalModelId,
          providerId: event.providerId,
          bucket: "hourly",
          bucketStart: hourly.start,
          bucketEnd: hourly.end,
          inputTokens: 0n,
          outputTokens: 0n,
          totalTokens: 0n,
          cachedInputTokens: 0n,
          reasoningTokens: 0n,
          requestCount: 0,
          attemptCount: 0,
          errorCount: 0,
          updatedAt: new Date(),
        };
      }
      hourlyAgg = this.projectEvent(hourlyAgg, event);
      aggregates.set(hourlyKey, hourlyAgg);

      // Daily bucket
      const daily = getDailyBucketRange(event.occurredAt);
      const dailyKey = computeAggregateKey(
        "daily",
        daily.start,
        event.organizationId,
        event.workspaceId,
        event.apiKeyId,
        event.canonicalModelId,
        event.providerId,
      );

      let dailyAgg = aggregates.get(dailyKey);
      if (!dailyAgg) {
        dailyAgg = {
          id: dailyKey,
          organizationId: event.organizationId,
          workspaceId: event.workspaceId,
          apiKeyId: event.apiKeyId,
          canonicalModelId: event.canonicalModelId,
          providerId: event.providerId,
          bucket: "daily",
          bucketStart: daily.start,
          bucketEnd: daily.end,
          inputTokens: 0n,
          outputTokens: 0n,
          totalTokens: 0n,
          cachedInputTokens: 0n,
          reasoningTokens: 0n,
          requestCount: 0,
          attemptCount: 0,
          errorCount: 0,
          updatedAt: new Date(),
        };
      }
      dailyAgg = this.projectEvent(dailyAgg, event);
      aggregates.set(dailyKey, dailyAgg);
    }

    return aggregates;
  }
}
