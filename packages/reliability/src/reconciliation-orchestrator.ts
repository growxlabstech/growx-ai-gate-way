export interface ReconciliationDomainResult {
  domain: string;
  itemsEvaluated: number;
  itemsReconciled: number;
  errors: string[];
}

export interface PlatformReconciliationReport {
  timestamp: Date;
  overallStatus: "COMPLETED" | "PARTIAL" | "FAILED";
  domainResults: ReconciliationDomainResult[];
}

export class PlatformReconciliationOrchestrator {
  public async reconcileAll(
    domainHandlers: Array<{
      name: string;
      reconcile: () => Promise<{
        evaluated: number;
        reconciled: number;
        errors?: string[];
      }>;
    }>,
  ): Promise<PlatformReconciliationReport> {
    const results: ReconciliationDomainResult[] = [];
    let hasFailures = false;

    for (const handler of domainHandlers) {
      try {
        const res = await handler.reconcile();
        results.push({
          domain: handler.name,
          itemsEvaluated: res.evaluated,
          itemsReconciled: res.reconciled,
          errors: res.errors || [],
        });
        if (res.errors && res.errors.length > 0) {
          hasFailures = true;
        }
      } catch (err: any) {
        hasFailures = true;
        results.push({
          domain: handler.name,
          itemsEvaluated: 0,
          itemsReconciled: 0,
          errors: [err?.message || "Reconciliation error"],
        });
      }
    }

    return {
      timestamp: new Date(),
      overallStatus: hasFailures ? "PARTIAL" : "COMPLETED",
      domainResults: results,
    };
  }
}
