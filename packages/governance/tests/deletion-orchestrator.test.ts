import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryGovernanceRepository } from '../src/repository.js';
import { GovernanceDeletionOrchestrator } from '../src/deletion-orchestrator.js';
import { MockDomainDeletionProcessor } from '../src/processors/deletion-processor.js';
import type { DeletionRequest, RetentionHold } from '@growx/contracts';

describe('GovernanceDeletionOrchestrator', () => {
  let repo: InMemoryGovernanceRepository;
  let orchestrator: GovernanceDeletionOrchestrator;

  beforeEach(() => {
    repo = new InMemoryGovernanceRepository();
    orchestrator = new GovernanceDeletionOrchestrator(repo);
    orchestrator.registerProcessor(new MockDomainDeletionProcessor('postgres'));
    orchestrator.registerProcessor(new MockDomainDeletionProcessor('object_storage'));
    orchestrator.registerProcessor(new MockDomainDeletionProcessor('vector_store'));
  });

  it('executes multi-processor deletion and records verified evidence', async () => {
    const req: DeletionRequest = {
      id: 'dreq_test_1',
      organizationId: 'org_test',
      requestedBy: 'usr_admin',
      scope: 'organization',
      status: 'QUEUED',
      createdAt: new Date(),
    };
    await repo.createDeletionRequest(req);

    const completedReq = await orchestrator.executeDeletion('dreq_test_1');
    expect(completedReq.status).toBe('COMPLETED');
    expect(completedReq.completedAt).toBeDefined();

    const tasks = await repo.listDeletionTasks('dreq_test_1');
    expect(tasks.length).toBe(3);
    for (const t of tasks) {
      expect(t.status).toBe('completed');
    }

    const evidence = await repo.listEvidence('dreq_test_1');
    expect(evidence.length).toBe(3);
    for (const ev of evidence) {
      expect(ev.outcome).toBe('PURGED');
    }
  });

  it('blocks deletion when active retention hold exists', async () => {
    const hold: RetentionHold = {
      id: 'hold_legal_1',
      organizationId: 'org_held',
      scope: 'organization',
      reasonCode: 'LEGAL_HOLD_PENDING_LITIGATION',
      createdBy: 'legal_team',
      startsAt: new Date(),
      status: 'active',
    };
    await repo.createHold(hold);

    const req: DeletionRequest = {
      id: 'dreq_held_1',
      organizationId: 'org_held',
      requestedBy: 'usr_admin',
      scope: 'organization',
      status: 'QUEUED',
      createdAt: new Date(),
    };
    await repo.createDeletionRequest(req);

    const result = await orchestrator.executeDeletion('dreq_held_1');
    expect(result.status).toBe('BLOCKED');
    expect(result.reason).toContain('LEGAL_HOLD_PENDING_LITIGATION');
  });
});
