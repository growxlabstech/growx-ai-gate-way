import { describe, it, expect } from 'vitest';
import { ProviderOperationStateMachine, TERMINAL_STATUSES } from '../src/state-machine.js';
import { InvalidStateTransitionError } from '../src/types.js';

describe('ProviderOperationStateMachine', () => {
  it('correctly identifies terminal statuses', () => {
    for (const status of TERMINAL_STATUSES) {
      expect(ProviderOperationStateMachine.isTerminal(status)).toBe(true);
    }
    expect(ProviderOperationStateMachine.isTerminal('running')).toBe(false);
    expect(ProviderOperationStateMachine.isTerminal('queued')).toBe(false);
    expect(ProviderOperationStateMachine.isTerminal('finalizing')).toBe(false);
  });

  it('allows valid progressive state transitions', () => {
    expect(ProviderOperationStateMachine.canTransition('created', 'submitted')).toBe(true);
    expect(ProviderOperationStateMachine.canTransition('submitted', 'queued')).toBe(true);
    expect(ProviderOperationStateMachine.canTransition('queued', 'running')).toBe(true);
    expect(ProviderOperationStateMachine.canTransition('running', 'finalizing')).toBe(true);
    expect(ProviderOperationStateMachine.canTransition('finalizing', 'completed')).toBe(true);
  });

  it('forbids invalid and regressive transitions', () => {
    expect(ProviderOperationStateMachine.canTransition('completed', 'running')).toBe(false);
    expect(ProviderOperationStateMachine.canTransition('failed', 'queued')).toBe(false);
    expect(ProviderOperationStateMachine.canTransition('cancelled', 'running')).toBe(false);
    expect(ProviderOperationStateMachine.canTransition('created', 'completed')).toBe(false);

    expect(() =>
      ProviderOperationStateMachine.assertCanTransition('completed', 'running')
    ).toThrow(InvalidStateTransitionError);
  });
});
