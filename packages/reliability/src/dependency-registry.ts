import type { ReliabilityDependency } from "@growx/contracts";

export const CANONICAL_DEPENDENCIES: Record<string, ReliabilityDependency> = {
  postgres: {
    name: "postgres",
    owner: "Platform Infrastructure",
    criticality: "TIER_0",
    sourceOfTruth: true,
    recoveryClass: "NO_DATA_LOSS_EXPECTED",
    failureMode: "Connection refused / Query timeout",
    degradedBehavior:
      "Fail-closed on writes, bounded cache read-only if configured",
    recoveryStrategy:
      "Automated replica promotion / PITR point-in-time restore",
    rpoMinutes: 0.1, // Near-zero logical loss with WAL streaming
    rtoMinutes: 15, // Replica failover <= 2m, cold restore <= 15m
    healthCheck: "SELECT 1",
    backupStrategy: "Continuous WAL archiving + daily automated snapshots",
    region: "primary-region",
    failoverTarget: "standby-replica",
    runbookId: "rb_postgres_outage",
  },
  redis: {
    name: "redis",
    owner: "Platform Infrastructure",
    criticality: "TIER_1",
    sourceOfTruth: false,
    recoveryClass: "REBUILDABLE",
    failureMode: "Socket timeout / Connection dropped",
    degradedBehavior: "Bypass cache to DB; local conservative rate limiting",
    recoveryStrategy:
      "Cold instance restart, transparent in-memory state rebuild",
    rpoMinutes: 0,
    rtoMinutes: 2,
    healthCheck: "PING",
    backupStrategy: "Reconstructable from DB/Model/Policy state",
    region: "primary-region",
    failoverTarget: "redis-replica",
    runbookId: "rb_redis_outage",
  },
  object_storage: {
    name: "object_storage",
    owner: "Platform Infrastructure",
    criticality: "TIER_1",
    sourceOfTruth: true,
    recoveryClass: "NO_DATA_LOSS_EXPECTED",
    failureMode: "S3 503 SlowDown / Network timeout",
    degradedBehavior:
      "Text inference unaffected; file/media uploads deferred safely",
    recoveryStrategy:
      "Cross-region replication failover / bucket version restore",
    rpoMinutes: 0,
    rtoMinutes: 5,
    healthCheck: "HeadBucket / ListObjects",
    backupStrategy: "Object versioning + cross-region lifecycle replication",
    region: "primary-region",
    failoverTarget: "secondary-bucket",
    runbookId: "rb_object_storage_outage",
  },
  provider_vault: {
    name: "provider_vault",
    owner: "Security / Ops",
    criticality: "TIER_0",
    sourceOfTruth: true,
    recoveryClass: "NO_DATA_LOSS_EXPECTED",
    failureMode: "KMS decryption failure / Vault unavailable",
    degradedBehavior:
      "Fail-closed; do not route to accounts with unresolved credentials",
    recoveryStrategy: "JIT Key rotation and redundant KMS endpoint failover",
    rpoMinutes: 0,
    rtoMinutes: 5,
    healthCheck: "KMS Ping / Status probe",
    backupStrategy: "Envelope encryption with managed master key replication",
    region: "GLOBAL",
    failoverTarget: "backup-kms-region",
    runbookId: "rb_secret_vault_failure",
  },
  provider_upstreams: {
    name: "provider_upstreams",
    owner: "Gateway / Routing",
    criticality: "TIER_1",
    sourceOfTruth: false,
    recoveryClass: "EXTERNAL_SOURCE_RECOVERABLE",
    failureMode: "HTTP 5xx / 429 RateLimit / Circuit OPEN",
    degradedBehavior:
      "Router V2 multi-provider fallback within compatible routes",
    recoveryStrategy: "Dynamic route score degradation, circuit backoff, drain",
    rpoMinutes: 0,
    rtoMinutes: 1,
    healthCheck: "Live request probes / provider status feed",
    backupStrategy:
      "Provider pooling across OpenAI, Anthropic, Google, DeepSeek",
    region: "GLOBAL",
    failoverTarget: "alternate-provider-route",
    runbookId: "rb_provider_mass_outage",
  },
  outbox_queue: {
    name: "outbox_queue",
    owner: "Platform Async Plane",
    criticality: "TIER_2",
    sourceOfTruth: false,
    recoveryClass: "REPLAYABLE",
    failureMode: "Broker queue backlog / Consumer disconnect",
    degradedBehavior: "Outbox retained in PostgreSQL; asynchronous retry",
    recoveryStrategy:
      "Worker fleet scale-up and atomic batch claiming from outbox",
    rpoMinutes: 0,
    rtoMinutes: 5,
    healthCheck: "Queue depth / consumer lag probe",
    backupStrategy: "Durable PostgreSQL outbox table",
    region: "primary-region",
    failoverTarget: "secondary-worker-pool",
    runbookId: "rb_queue_backlog",
  },
};

export class DependencyRegistry {
  private dependencies = new Map<string, ReliabilityDependency>();

  constructor(
    initial: Record<string, ReliabilityDependency> = CANONICAL_DEPENDENCIES,
  ) {
    for (const [key, dep] of Object.entries(initial)) {
      this.dependencies.set(key, { ...dep });
    }
  }

  public get(name: string): ReliabilityDependency | undefined {
    return this.dependencies.get(name);
  }

  public list(): ReliabilityDependency[] {
    return Array.from(this.dependencies.values());
  }

  public listByTier(tier: string): ReliabilityDependency[] {
    return Array.from(this.dependencies.values()).filter(
      (d) => d.criticality === tier,
    );
  }
}
