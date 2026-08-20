import { describe, it, expect } from 'vitest';
import { RUNBOOKS } from '../src/runbooks/index.js';

describe('Runbooks', () => {
  it('contains all 10 canonical operational runbooks with executable steps', () => {
    const expectedRunbookIds = [
      'rb_postgres_outage',
      'rb_redis_outage',
      'rb_object_storage_outage',
      'rb_region_outage',
      'rb_provider_mass_outage',
      'rb_secret_vault_failure',
      'rb_bad_deployment',
      'rb_bad_migration',
      'rb_queue_backlog',
      'rb_billing_outage',
    ];

    for (const id of expectedRunbookIds) {
      const rb = RUNBOOKS[id];
      expect(rb).toBeDefined();
      expect(rb?.steps.length).toBeGreaterThanOrEqual(3);
      for (const step of rb!.steps) {
        expect(step.title).toBeDefined();
        expect(step.commandOrAction).toBeDefined();
        expect(step.verification).toBeDefined();
      }
    }
  });
});
