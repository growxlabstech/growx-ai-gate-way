import { describe, it, expect } from 'vitest';
import { LanguageMigrationDecisionEngine } from '../src/migration-decision-engine.js';

describe('LanguageMigrationDecisionEngine', () => {
  it('evaluates all platform components against empirical evidence', () => {
    const evaluations = LanguageMigrationDecisionEngine.evaluateAllServices();
    expect(evaluations.length).toBeGreaterThanOrEqual(6);

    for (const ev of evaluations) {
      expect(ev.serviceName).toBeDefined();
      expect(ev.currentLanguage).toBe('TypeScript');
      expect(ev.decision).toBeDefined();
      expect(ev.reason.length).toBeGreaterThan(10);
    }

    const gateway = evaluations.find((e) => e.serviceName.includes('Gateway'));
    expect(gateway?.decision).toBe('KEEP_TYPESCRIPT');
  });
});
