import type { RuntimeTarget, RuntimeRoutingPolicy } from "@growx/contracts";
import { CanaryRollbackError } from "./types.js";

export class RuntimeCanaryController {
  private policy: RuntimeRoutingPolicy;
  private errorCount = 0;
  private totalCount = 0;

  constructor(policy?: Partial<RuntimeRoutingPolicy>) {
    this.policy = {
      target: policy?.target ?? "go_runtime",
      stage: policy?.stage ?? "0_disabled",
      canaryPercentage: policy?.canaryPercentage ?? 0,
      allowedOrganizations: policy?.allowedOrganizations ?? [],
      allowedModels: policy?.allowedModels ?? [],
      fallbackTarget: policy?.fallbackTarget ?? "typescript",
      rollbackOnErrorSpike: policy?.rollbackOnErrorSpike ?? true,
      errorThresholdRatio: policy?.errorThresholdRatio ?? 0.02,
      status: policy?.status ?? "active",
    };
  }

  public getPolicy(): RuntimeRoutingPolicy {
    return { ...this.policy };
  }

  public updatePolicy(updates: Partial<RuntimeRoutingPolicy>): void {
    this.policy = {
      ...this.policy,
      ...updates,
    };
  }

  public resolveRuntimeTarget(context: {
    organizationId: string;
    modelId?: string;
  }): { target: RuntimeTarget; isCanary: boolean } {
    if (
      this.policy.status === "rolling_back" ||
      this.policy.status === "disabled"
    ) {
      return { target: this.policy.fallbackTarget, isCanary: false };
    }

    if (this.policy.canaryPercentage === 0) {
      return { target: "typescript", isCanary: false };
    }

    // Check organization allowlist if specified
    if (
      this.policy.allowedOrganizations.length > 0 &&
      !this.policy.allowedOrganizations.includes(context.organizationId)
    ) {
      return { target: "typescript", isCanary: false };
    }

    // Check model allowlist if specified
    if (
      context.modelId &&
      this.policy.allowedModels.length > 0 &&
      !this.policy.allowedModels.includes(context.modelId)
    ) {
      return { target: "typescript", isCanary: false };
    }

    // Deterministic consistent hashing over organizationId
    const hash = this.hashString(context.organizationId);
    const bucket = hash % 100;

    if (bucket < this.policy.canaryPercentage) {
      return { target: this.policy.target, isCanary: true };
    }

    return { target: "typescript", isCanary: false };
  }

  public recordExecution(isError: boolean): void {
    this.totalCount++;
    if (isError) {
      this.errorCount++;
    }

    if (
      this.policy.rollbackOnErrorSpike &&
      this.totalCount >= 20 &&
      this.errorCount / this.totalCount > this.policy.errorThresholdRatio
    ) {
      this.triggerRollback(
        `Error rate ${Math.round((this.errorCount / this.totalCount) * 100)}% exceeded threshold`,
      );
    }
  }

  public triggerRollback(reason: string): void {
    this.policy.status = "rolling_back";
    this.policy.canaryPercentage = 0;
    this.policy.stage = "0_disabled";
    throw new CanaryRollbackError(reason);
  }

  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  }
}
