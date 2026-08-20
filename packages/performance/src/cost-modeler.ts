export interface InfrastructureCostBreakdown {
  computeCostUsdPerMillion: number;
  databaseCostUsdPerMillion: number;
  redisCostUsdPerMillion: number;
  networkEgressCostUsdPerMillion: number;
  observabilityCostUsdPerMillion: number;
  totalPlatformCostUsdPerMillion: number;
  unitCostUsdPerRequest: number;
}

export class InfrastructureCostModeler {
  public static calculateCostPerMillion(options: {
    avgComputeDurationMs?: number;
    dbQueriesPerRequest?: number;
    redisOpsPerRequest?: number;
    avgPayloadBytes?: number;
  } = {}): InfrastructureCostBreakdown {
    const durationMs = options.avgComputeDurationMs ?? 8;
    const dbQueries = options.dbQueriesPerRequest ?? 2;
    const redisOps = options.redisOpsPerRequest ?? 1;
    const payloadBytes = options.avgPayloadBytes ?? 2048;

    // Standard Cloud Infrastructure Cost Constants (per 1M units)
    const computeCost = (durationMs / 1000) * 0.00001667 * 1_000_000; // Lambda / Container vCPU
    const dbCost = dbQueries * 0.15; // Managed PostgreSQL connection / IOPS
    const redisCost = redisOps * 0.05; // Managed Redis memory & commands
    const networkCost = (payloadBytes / (1024 * 1024 * 1024)) * 0.09 * 1_000_000; // $0.09 / GB
    const obsCost = 0.20; // Tracing & structured logs

    const total = computeCost + dbCost + redisCost + networkCost + obsCost;

    return {
      computeCostUsdPerMillion: Math.round(computeCost * 100) / 100,
      databaseCostUsdPerMillion: Math.round(dbCost * 100) / 100,
      redisCostUsdPerMillion: Math.round(redisCost * 100) / 100,
      networkEgressCostUsdPerMillion: Math.round(networkCost * 100) / 100,
      observabilityCostUsdPerMillion: Math.round(obsCost * 100) / 100,
      totalPlatformCostUsdPerMillion: Math.round(total * 100) / 100,
      unitCostUsdPerRequest: Math.round((total / 1_000_000) * 100_000_000) / 100_000_000,
    };
  }
}
