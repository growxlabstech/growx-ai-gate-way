export interface RunbookStep {
  stepNumber: number;
  title: string;
  commandOrAction: string;
  verification: string;
}

export interface RunbookDefinition {
  id: string;
  title: string;
  targetDependency: string;
  severity: "SEV0" | "SEV1" | "SEV2" | "SEV3";
  steps: RunbookStep[];
}

export const RUNBOOKS: Record<string, RunbookDefinition> = {
  rb_postgres_outage: {
    id: "rb_postgres_outage",
    title: "PostgreSQL Outage Recovery Runbook",
    targetDependency: "postgres",
    severity: "SEV0",
    steps: [
      { stepNumber: 1, title: "Detect & Confirm", commandOrAction: "Probe DB liveness / inspect error rate spikes", verification: "Confirm 5xx spike is DB connection timeout" },
      { stepNumber: 2, title: "Freeze Unsafe Writes", commandOrAction: "Set ReliabilityControlPlane mode to READ_ONLY", verification: "Readiness returns read-only state" },
      { stepNumber: 3, title: "Promote Replica / PITR", commandOrAction: "Trigger standby replica promotion", verification: "Replica accepts write transaction" },
      { stepNumber: 4, title: "Verify Critical Invariants", commandOrAction: "Execute CriticalInvariantVerifier.verifyAll()", verification: "Zero ledger or hash discrepancies" },
      { stepNumber: 5, title: "Resume & Reconcile", commandOrAction: "Set mode to NORMAL and run PlatformReconciliationOrchestrator", verification: "Reconciliation status is COMPLETED" },
    ],
  },
  rb_redis_outage: {
    id: "rb_redis_outage",
    title: "Redis Outage Recovery Runbook",
    targetDependency: "redis",
    severity: "SEV1",
    steps: [
      { stepNumber: 1, title: "Detect", commandOrAction: "Redis health probe fails", verification: "Logs report Redis timeout" },
      { stepNumber: 2, title: "Bypass Cache", commandOrAction: "Fallback cache lookups to PostgreSQL", verification: "Gateway completions continue" },
      { stepNumber: 3, title: "Restart Instance", commandOrAction: "Cold start new Redis node", verification: "PING returns PONG" },
      { stepNumber: 4, title: "Rebuild State", commandOrAction: "Warm cache and restore route snapshots from ModelRegistry", verification: "Snapshot query returns active routes" },
    ],
  },
  rb_object_storage_outage: {
    id: "rb_object_storage_outage",
    title: "Object Storage Outage Runbook",
    targetDependency: "object_storage",
    severity: "SEV1",
    steps: [
      { stepNumber: 1, title: "Isolate Media Flows", commandOrAction: "Disable fileInference and multimodal capabilities in control plane", verification: "Text inference remains available" },
      { stepNumber: 2, title: "Hold Finalizers", commandOrAction: "Keep ProviderOperation finalization in pending retry state", verification: "No data lost; artifacts wait for storage" },
      { stepNumber: 3, title: "Restore / Failover Bucket", commandOrAction: "Switch storage target to secondary bucket", verification: "Bucket HEAD probe returns 200" },
      { stepNumber: 4, title: "Resume Uploads", commandOrAction: "Re-enable capabilities in control plane", verification: "File uploads succeed" },
    ],
  },
  rb_region_outage: {
    id: "rb_region_outage",
    title: "Regional Outage Failover Runbook",
    targetDependency: "platform_region",
    severity: "SEV0",
    steps: [
      { stepNumber: 1, title: "Declare Incident", commandOrAction: "Create SEV0 Incident for affected region", verification: "Incident created in IncidentManager" },
      { stepNumber: 2, title: "Check Governance Constraints", commandOrAction: "Verify secondary region satisfies Phase-35 residency policies", verification: "No residency violations on failover" },
      { stepNumber: 3, title: "Shift Stateless Traffic", commandOrAction: "Update DNS/Edge traffic weights to standby region", verification: "Edge routes requests to standby fleet" },
      { stepNumber: 4, title: "Promote Stateful Standby", commandOrAction: "Promote regional database replica if primary region lost", verification: "DB replica active in secondary region" },
      { stepNumber: 5, title: "Reconcile", commandOrAction: "Run post-incident reconciliation", verification: "Reconciliation completed" },
    ],
  },
  rb_provider_mass_outage: {
    id: "rb_provider_mass_outage",
    title: "Provider Mass Outage Runbook",
    targetDependency: "provider_upstreams",
    severity: "SEV1",
    steps: [
      { stepNumber: 1, title: "Open Provider Circuit", commandOrAction: "Trip circuit breaker for degraded provider", verification: "Circuit state is OPEN" },
      { stepNumber: 2, title: "Router V2 Auto-Fallback", commandOrAction: "Router shifts traffic to compatible alternative routes", verification: "Candidate scoring selects healthy routes" },
      { stepNumber: 3, title: "Enforce Governance Pinning", commandOrAction: "Fail closed on strict residency / zero-retention routes without alternatives", verification: "Zero policy-violating fallbacks" },
    ],
  },
  rb_secret_vault_failure: {
    id: "rb_secret_vault_failure",
    title: "Secret Vault Failure Runbook",
    targetDependency: "provider_vault",
    severity: "SEV0",
    steps: [
      { stepNumber: 1, title: "Fail Closed", commandOrAction: "Disable unverified provider execution targets", verification: "Zero plaintext secret leakage" },
      { stepNumber: 2, title: "Failover KMS Endpoint", commandOrAction: "Switch to secondary KMS region", verification: "Decryption probe succeeds" },
      { stepNumber: 3, title: "Verify Credentials", commandOrAction: "Verify active credential versions", verification: "Exactly 1 active version per account" },
    ],
  },
  rb_bad_deployment: {
    id: "rb_bad_deployment",
    title: "Bad Deployment Rollback Runbook",
    targetDependency: "application_deployment",
    severity: "SEV1",
    steps: [
      { stepNumber: 1, title: "Detect Regression", commandOrAction: "Check health probes & canary error rate", verification: "Canary failure threshold breached" },
      { stepNumber: 2, title: "Rollback Container / Fleet", commandOrAction: "Deploy previous known-good release image", verification: "Rollback deployment healthy" },
      { stepNumber: 3, title: "Verify Schema Compatibility", commandOrAction: "Confirm database schema operates under previous release", verification: "Old version operates cleanly" },
    ],
  },
  rb_bad_migration: {
    id: "rb_bad_migration",
    title: "Bad Migration Forward-Fix / Rollback Runbook",
    targetDependency: "database_schema",
    severity: "SEV0",
    steps: [
      { stepNumber: 1, title: "Freeze Writes", commandOrAction: "Set platform mode to READ_ONLY", verification: "Writes paused safely" },
      { stepNumber: 2, title: "Execute Rollback Script", commandOrAction: "Apply idempotent down migration or forward-fix patch", verification: "Schema matches expected state" },
      { stepNumber: 3, title: "Verify Invariants", commandOrAction: "Run CriticalInvariantVerifier", verification: "All invariants pass" },
      { stepNumber: 4, title: "Resume Traffic", commandOrAction: "Restore mode to NORMAL", verification: "Mode is NORMAL" },
    ],
  },
  rb_queue_backlog: {
    id: "rb_queue_backlog",
    title: "Queue & Outbox Backlog Recovery Runbook",
    targetDependency: "outbox_queue",
    severity: "SEV2",
    steps: [
      { stepNumber: 1, title: "Shed Low-Priority Work", commandOrAction: "Pause new batch submissions via kill switch", verification: "Batch submissions paused" },
      { stepNumber: 2, title: "Scale Consumer Fleet", commandOrAction: "Increase outbox worker concurrency", verification: "Worker capacity doubled" },
      { stepNumber: 3, title: "Drain & Reconcile", commandOrAction: "Process outbox with idempotent consumers", verification: "Outbox backlog returns to 0" },
      { stepNumber: 4, title: "Resume New Submissions", commandOrAction: "Re-enable batch submission switch", verification: "Batch submissions active" },
    ],
  },
  rb_billing_outage: {
    id: "rb_billing_outage",
    title: "Billing & Settlement Outage Runbook",
    targetDependency: "billing_service",
    severity: "SEV1",
    steps: [
      { stepNumber: 1, title: "Fail Closed on Cost-Bearing Writes", commandOrAction: "Pause unverified paid inference where wallet settlement fails", verification: "Zero unaccounted spend" },
      { stepNumber: 2, title: "Queue Settlement Events", commandOrAction: "Persist usage records to durable outbox", verification: "Usage records stored" },
      { stepNumber: 3, title: "Reconcile Ledgers Post-Recovery", commandOrAction: "Run PlatformReconciliationOrchestrator for wallet domain", verification: "Ledgers match balances" },
    ],
  },
};
