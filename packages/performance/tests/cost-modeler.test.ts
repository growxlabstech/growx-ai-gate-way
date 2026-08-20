import { describe, it, expect } from 'vitest';
import { InfrastructureCostModeler } from '../src/cost-modeler.js';

describe('InfrastructureCostModeler', () => {
  it('calculates realistic infrastructure costs per million requests', () => {
    const cost = InfrastructureCostModeler.calculateCostPerMillion({
      avgComputeDurationMs: 10,
      dbQueriesPerRequest: 2,
      redisOpsPerRequest: 1,
      avgPayloadBytes: 2048,
    });

    expect(cost.computeCostUsdPerMillion).toBeGreaterThan(0);
    expect(cost.databaseCostUsdPerMillion).toBeGreaterThan(0);
    expect(cost.totalPlatformCostUsdPerMillion).toBeGreaterThan(0);
    expect(cost.unitCostUsdPerRequest).toBeLessThan(0.001); // Less than 1/10th of a cent
  });
});
