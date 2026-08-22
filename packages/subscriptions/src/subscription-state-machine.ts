import type { SubscriptionStatus } from "./types.js";

/**
 * Defines valid subscription state transitions.
 * Each key is a current state; the value is the set of states it can transition to.
 */
const VALID_TRANSITIONS: Record<
  SubscriptionStatus,
  readonly SubscriptionStatus[]
> = {
  trialing: ["active", "cancelled", "expired"],
  active: ["paused", "cancelled", "past_due", "expired"],
  paused: ["active", "cancelled"],
  past_due: ["active", "cancelled", "expired"],
  cancelled: [], // terminal
  expired: [], // terminal
};

export interface TransitionResult {
  valid: boolean;
  reason?: string;
}

/**
 * Validates whether a subscription state transition is allowed.
 * Returns { valid: true } if allowed, or { valid: false, reason } if not.
 */
export function validateTransition(
  from: SubscriptionStatus,
  to: SubscriptionStatus,
): TransitionResult {
  if (from === to) {
    return {
      valid: false,
      reason: `Subscription is already in '${from}' state`,
    };
  }

  const allowed = VALID_TRANSITIONS[from];
  if (!allowed) {
    return { valid: false, reason: `Unknown subscription state: '${from}'` };
  }

  if (!allowed.includes(to)) {
    return {
      valid: false,
      reason: `Cannot transition from '${from}' to '${to}'. Allowed transitions: ${allowed.length > 0 ? allowed.join(", ") : "none (terminal state)"}`,
    };
  }

  return { valid: true };
}

/**
 * Returns true if the given status is a terminal state (no further transitions).
 */
export function isTerminalState(status: SubscriptionStatus): boolean {
  return VALID_TRANSITIONS[status]?.length === 0;
}

/**
 * Returns the list of valid target states from the given state.
 */
export function getValidTransitions(
  from: SubscriptionStatus,
): readonly SubscriptionStatus[] {
  return VALID_TRANSITIONS[from] ?? [];
}
