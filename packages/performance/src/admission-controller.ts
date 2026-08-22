import type { AdmissionDecision } from "@growx/contracts";

export interface AdmissionOptions {
  maxGlobalConcurrency?: number;
  maxTenantConcurrency?: number;
  overloadThresholdRatio?: number; // e.g. 0.85 (85%)
}

export class AdmissionController {
  private activeGlobalCount = 0;
  private activeTenantCounts = new Map<string, number>();

  private maxGlobalConcurrency: number;
  private maxTenantConcurrency: number;
  private overloadThresholdRatio: number;

  constructor(options: AdmissionOptions = {}) {
    this.maxGlobalConcurrency = options.maxGlobalConcurrency ?? 1000;
    this.maxTenantConcurrency = options.maxTenantConcurrency ?? 100;
    this.overloadThresholdRatio = options.overloadThresholdRatio ?? 0.85;
  }

  public evaluateAdmission(context: {
    organizationId: string;
    priority?: "CRITICAL" | "STANDARD" | "BATCH" | "BACKGROUND";
    weight?: number;
  }): AdmissionDecision {
    const priority = context.priority || "STANDARD";
    const tenantId = context.organizationId;
    const currentTenantCount = this.activeTenantCounts.get(tenantId) || 0;

    // 1. Tenant Fairness Check (Prevent noisy neighbor starvation)
    if (currentTenantCount >= this.maxTenantConcurrency) {
      return {
        allowed: false,
        reason: `Tenant concurrency limit (${this.maxTenantConcurrency}) exceeded`,
        tenantWeight: 1,
        shedPriority: priority,
        retryAfterMs: 500,
      };
    }

    // 2. Global Capacity Protection
    if (this.activeGlobalCount >= this.maxGlobalConcurrency) {
      return {
        allowed: false,
        reason: "Global platform concurrency capacity reached",
        tenantWeight: 1,
        shedPriority: priority,
        retryAfterMs: 1000,
      };
    }

    // 3. Priority Load Shedding during High Utilization
    const utilization = this.activeGlobalCount / this.maxGlobalConcurrency;
    if (utilization >= this.overloadThresholdRatio) {
      // Shed BATCH and BACKGROUND work first to protect real-time interactive traffic
      if (priority === "BATCH" || priority === "BACKGROUND") {
        return {
          allowed: false,
          reason: `Load shedding: low-priority '${priority}' shed during high platform utilization (${Math.round(utilization * 100)}%)`,
          tenantWeight: 1,
          shedPriority: priority,
          retryAfterMs: 2000,
        };
      }
    }

    return {
      allowed: true,
      tenantWeight: 1,
      shedPriority: priority,
    };
  }

  public acquire(organizationId: string): void {
    this.activeGlobalCount++;
    const current = this.activeTenantCounts.get(organizationId) || 0;
    this.activeTenantCounts.set(organizationId, current + 1);
  }

  public release(organizationId: string): void {
    this.activeGlobalCount = Math.max(0, this.activeGlobalCount - 1);
    const current = this.activeTenantCounts.get(organizationId) || 0;
    if (current <= 1) {
      this.activeTenantCounts.delete(organizationId);
    } else {
      this.activeTenantCounts.set(organizationId, current - 1);
    }
  }

  public getActiveCounts(): {
    global: number;
    tenants: Record<string, number>;
  } {
    return {
      global: this.activeGlobalCount,
      tenants: Object.fromEntries(this.activeTenantCounts.entries()),
    };
  }
}
