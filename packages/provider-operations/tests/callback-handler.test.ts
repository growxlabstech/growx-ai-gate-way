import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryProviderOperationRepository } from '../src/repository.js';
import { ProviderOperationCallbackHandler } from '../src/callback-handler.js';
import { DeterministicOperationAdapter } from '../src/adapters/deterministic-operation-adapter.js';
import { CallbackAuthError } from '../src/types.js';
import type { ProviderOperation } from '@growx/contracts';

describe('ProviderOperationCallbackHandler', () => {
  let repo: InMemoryProviderOperationRepository;
  let handler: ProviderOperationCallbackHandler;
  let adapter: DeterministicOperationAdapter;

  beforeEach(() => {
    repo = new InMemoryProviderOperationRepository();
    handler = new ProviderOperationCallbackHandler(repo);
    adapter = new DeterministicOperationAdapter();
    handler.registerAdapter(adapter);
  });

  it('authenticates signature and transitions operation to finalizing on success callback', async () => {
    const op: ProviderOperation = {
      id: 'pop_cb_1',
      organizationId: 'org_test',
      requestId: 'req_cb',
      providerId: 'deterministic',
      routeId: 'rt_test',
      canonicalModelId: 'openai/dall-e-3',
      providerOperationId: 'mock_pop_123',
      operationType: 'image_generation',
      status: 'running',
      pollStrategy: 'callback',
      attemptCount: 0,
      createdAt: new Date(),
      metadata: {},
    };
    await repo.insert(op);

    const result = await handler.handleCallback(
      'deterministic',
      { providerOperationId: 'mock_pop_123', status: 'completed' },
      { authorization: 'Bearer secret_webhook_key' },
      'secret_webhook_key'
    );

    expect(result.handled).toBe(true);
    expect(result.operationId).toBe('pop_cb_1');

    const updated = await repo.getById('pop_cb_1');
    expect(updated?.status).toBe('finalizing');
  });

  it('rejects callbacks with invalid signature', async () => {
    await expect(
      handler.handleCallback(
        'deterministic',
        { providerOperationId: 'mock_pop_123' },
        { authorization: 'Bearer invalid_signature' },
        'expected_secret'
      )
    ).rejects.toThrow(CallbackAuthError);
  });

  it('prevents state regression from out-of-order callbacks', async () => {
    const op: ProviderOperation = {
      id: 'pop_cb_terminal',
      organizationId: 'org_test',
      requestId: 'req_cb',
      providerId: 'deterministic',
      routeId: 'rt_test',
      canonicalModelId: 'openai/dall-e-3',
      providerOperationId: 'mock_pop_123',
      operationType: 'image_generation',
      status: 'completed', // Already completed
      pollStrategy: 'callback',
      attemptCount: 0,
      createdAt: new Date(),
      metadata: {},
    };
    await repo.insert(op);

    // Old out-of-order callback arriving late with status 'running'
    const result = await handler.handleCallback(
      'deterministic',
      { providerOperationId: 'mock_pop_123', status: 'running' },
      {}
    );

    expect(result.handled).toBe(true);
    const updated = await repo.getById('pop_cb_terminal');
    expect(updated?.status).toBe('completed'); // Remains completed!
  });
});
