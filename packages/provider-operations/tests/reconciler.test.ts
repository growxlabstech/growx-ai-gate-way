import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InMemoryProviderOperationRepository } from '../src/repository.js';
import { ProviderOperationReconciler } from '../src/reconciler.js';
import { ProviderOperationFinalizer } from '../src/finalizer.js';
import type { ProviderOperation } from '@growx/contracts';

describe('ProviderOperationReconciler', () => {
  let repo: InMemoryProviderOperationRepository;
  let reconciler: ProviderOperationReconciler;
  let finalizer: ProviderOperationFinalizer;

  beforeEach(() => {
    repo = new InMemoryProviderOperationRepository();
    finalizer = new ProviderOperationFinalizer(repo);
    vi.spyOn(finalizer, 'finalize').mockResolvedValue(undefined);
    reconciler = new ProviderOperationReconciler(repo, finalizer);
  });

  it('recovers expired leases and retries stalled finalizing operations', async () => {
    const stuckFinalizing: ProviderOperation = {
      id: 'pop_stuck_1',
      organizationId: 'org_test',
      requestId: 'req_stuck_1',
      providerId: 'deterministic',
      routeId: 'rt_test',
      canonicalModelId: 'openai/dall-e-3',
      providerOperationId: 'mock_pop_1',
      operationType: 'image_generation',
      status: 'finalizing',
      createdAt: new Date(Date.now() - 600_000), // 10 minutes ago
      lastPolledAt: new Date(Date.now() - 600_000),
      metadata: {},
    };
    await repo.insert(stuckFinalizing);

    const recoveredCount = await reconciler.reconcileStuckOperations(300_000); // threshold 5 mins
    expect(recoveredCount).toBe(1);
    expect(finalizer.finalize).toHaveBeenCalledWith('pop_stuck_1');
  });
});
