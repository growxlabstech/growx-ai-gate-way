import { describe, it, expect } from 'vitest';
import { DependencyRegistry, CANONICAL_DEPENDENCIES } from '../src/dependency-registry.js';

describe('DependencyRegistry', () => {
  const registry = new DependencyRegistry();

  it('contains all canonical platform dependencies with correct criticality tiers', () => {
    const list = registry.list();
    expect(list.length).toBeGreaterThanOrEqual(6);

    const postgres = registry.get('postgres');
    expect(postgres).toBeDefined();
    expect(postgres?.criticality).toBe('TIER_0');
    expect(postgres?.sourceOfTruth).toBe(true);
    expect(postgres?.recoveryClass).toBe('NO_DATA_LOSS_EXPECTED');
    expect(postgres?.rpoMinutes).toBeLessThan(1);

    const redis = registry.get('redis');
    expect(redis?.criticality).toBe('TIER_1');
    expect(redis?.sourceOfTruth).toBe(false);
    expect(redis?.recoveryClass).toBe('REBUILDABLE');

    const vault = registry.get('provider_vault');
    expect(vault?.criticality).toBe('TIER_0');
    expect(vault?.sourceOfTruth).toBe(true);
  });

  it('filters dependencies by tier correctly', () => {
    const tier0 = registry.listByTier('TIER_0');
    expect(tier0.some((d) => d.name === 'postgres')).toBe(true);
    expect(tier0.some((d) => d.name === 'provider_vault')).toBe(true);
  });
});
