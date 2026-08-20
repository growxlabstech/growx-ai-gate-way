import type { CanonicalModelStatus, ProviderRouteStatus, AliasStatus } from "@growx/contracts";

export class InvalidStatusTransitionError extends Error {
  constructor(entity: string, from: string, to: string) {
    super(`Invalid ${entity} status transition from '${from}' to '${to}'`);
    this.name = "InvalidStatusTransitionError";
  }
}

const ALLOWED_MODEL_TRANSITIONS: Record<CanonicalModelStatus, readonly CanonicalModelStatus[]> = {
  draft: ["active", "disabled", "retired"],
  active: ["deprecated", "disabled", "retired"],
  deprecated: ["active", "retired", "disabled"],
  disabled: ["active", "retired"],
  retired: [], // Terminal state
};

export function validateModelStatusTransition(
  current: CanonicalModelStatus,
  next: CanonicalModelStatus
): void {
  if (current === next) return;
  const allowed = ALLOWED_MODEL_TRANSITIONS[current] ?? [];
  if (!allowed.includes(next)) {
    throw new InvalidStatusTransitionError("CanonicalModel", current, next);
  }
}

const ALLOWED_ROUTE_TRANSITIONS: Record<ProviderRouteStatus, readonly ProviderRouteStatus[]> = {
  active: ["degraded", "disabled", "deprecated", "retired"],
  degraded: ["active", "disabled", "deprecated", "retired"],
  disabled: ["active", "degraded", "retired"],
  deprecated: ["active", "retired", "disabled"],
  retired: [], // Terminal state
};

export function validateRouteStatusTransition(
  current: ProviderRouteStatus,
  next: ProviderRouteStatus
): void {
  if (current === next) return;
  const allowed = ALLOWED_ROUTE_TRANSITIONS[current] ?? [];
  if (!allowed.includes(next)) {
    throw new InvalidStatusTransitionError("ProviderRoute", current, next);
  }
}

const ALLOWED_ALIAS_TRANSITIONS: Record<AliasStatus, readonly AliasStatus[]> = {
  active: ["deprecated", "retired"],
  deprecated: ["active", "retired"],
  retired: [], // Terminal state
};

export function validateAliasStatusTransition(
  current: AliasStatus,
  next: AliasStatus
): void {
  if (current === next) return;
  const allowed = ALLOWED_ALIAS_TRANSITIONS[current] ?? [];
  if (!allowed.includes(next)) {
    throw new InvalidStatusTransitionError("ModelAlias", current, next);
  }
}
