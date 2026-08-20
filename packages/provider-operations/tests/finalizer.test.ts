import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InMemoryProviderOperationRepository } from '../src/repository.js';
import { ProviderOperationFinalizer } from '../src/finalizer.js';
import { DeterministicOperationAdapter } from '../src/adapters/deterministic-operation-adapter.js';
import type { ProviderOperation } from '@growx/contracts';

describe('ProviderOperationFinalizer', () => {
  let repo: InMemoryProviderOperationRepository;
  let finalizer: ProviderOperationFinalizer;
  let adapter: DeterministicOperationAdapter;
  let mockUsageMetering: any;
  let mockCreditService: any;

  beforeEach(() => {
    repo = new InMemoryProviderOperationRepository();
    mockUsageMetering = { recordRequestCompleted: vi.fn().mockResolvedValue(undefined) };
    mockCreditService = { settleReservation: vi.fn().mockResolvedValue(undefined) };

    finalizer = new ProviderOperationFinalizer(repo, {
      usageMetering: mockUsageMetering,
      creditService: mockCreditService,
    });
    adapter = new DeterministicOperationAdapter();
    finalizer.registerAdapter(adapter);
  });

  it('finalizes operation, records usage, settles wallet, and sets completed status', async () => {
    const op: ProviderOperation = {
      id: 'pop_fin_1',
      organizationId: 'org_test',
      requestId: 'req_fin',
      providerId: 'deterministic',
      routeId: 'rt_test',
      canonicalModelId: 'openai/dall-e-3',
      providerOperationId: 'mock_pop_123',
      operationType: 'image_generation',
      status: 'finalizing',
      pollStrategy: 'poll',
      resultReference: 'ref_result_123',
      attemptCount: 1,
      createdAt: new Date(),
      metadata: { billingReservationId: 'res_123' },
    };
    await repo.insert(op);

    await finalizer.finalize('pop_fin_1');

    const updated = await repo.getById('pop_fin_1');
    expect(updated?.status).toBe('completed');
    expect(updated?.completedAt).toBeDefined();
    expect(mockUsageMetering.recordRequestCompleted).toHaveBeenCalled();
    expect(mockCreditService.settleReservation).toHaveBeenCalledWith(
      expect.objectContaining({ reservationId: 'res_123' })
    );
  });
});
