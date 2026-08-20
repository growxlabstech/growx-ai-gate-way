// @growx/subscriptions — Core domain package for subscription plans & entitlements

// Types
export type {
  Plan,
  PlanStatus,
  PlanVersion,
  PlanVersionStatus,
  BillingInterval,
  EntitlementDefinition,
  EntitlementValueType,
  ModelAccessRule,
  PlanLimit,
  OrganizationSubscription,
  SubscriptionStatus,
  FundingMode,
  SubscriptionPeriod,
  SubscriptionPeriodStatus,
  EntitlementOverride,
} from "./types.js";

export { ResolvedEntitlements, DENY_ALL_ENTITLEMENTS, globMatch } from "./types.js";

// State Machine
export {
  validateTransition,
  isTerminalState,
  getValidTransitions,
} from "./subscription-state-machine.js";
export type { TransitionResult } from "./subscription-state-machine.js";

// Entitlement Resolver
export { resolveEntitlements, mergeModelAccessRules } from "./entitlement-resolver.js";

// Period Calculator
export {
  calculateNextPeriod,
  calculateInitialPeriod,
  isPeriodExpired,
  isWithinPeriod,
} from "./period-calculator.js";
