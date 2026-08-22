import { z } from "zod";

// ==========================================
// 1. Criticality Tiers & Recovery Classes
// ==========================================

export const criticalityTierSchema = z.enum([
  "TIER_0",
  "TIER_1",
  "TIER_2",
  "TIER_3",
]);
export type CriticalityTier = z.infer<typeof criticalityTierSchema>;

export const recoveryClassSchema = z.enum([
  "NO_DATA_LOSS_EXPECTED",
  "REPLAYABLE",
  "REBUILDABLE",
  "CACHE_ONLY",
  "EXTERNAL_SOURCE_RECOVERABLE",
]);
export type RecoveryClass = z.infer<typeof recoveryClassSchema>;

export const platformOperationalModeSchema = z.enum([
  "NORMAL",
  "DEGRADED",
  "READ_ONLY",
  "MAINTENANCE",
]);
export type PlatformOperationalMode = z.infer<
  typeof platformOperationalModeSchema
>;

export const incidentSeveritySchema = z.enum(["SEV0", "SEV1", "SEV2", "SEV3"]);
export type IncidentSeverity = z.infer<typeof incidentSeveritySchema>;

export const incidentStatusSchema = z.enum([
  "investigating",
  "identified",
  "mitigating",
  "resolved",
]);
export type IncidentStatus = z.infer<typeof incidentStatusSchema>;

// ==========================================
// 2. Reliability Dependency Record
// ==========================================

export const reliabilityDependencySchema = z.object({
  name: z.string().min(1),
  owner: z.string().min(1),
  criticality: criticalityTierSchema,
  sourceOfTruth: z.boolean(),
  recoveryClass: recoveryClassSchema,
  failureMode: z.string().min(1),
  degradedBehavior: z.string().min(1),
  recoveryStrategy: z.string().min(1),
  rpoMinutes: z.number().nonnegative(),
  rtoMinutes: z.number().nonnegative(),
  healthCheck: z.string().min(1),
  backupStrategy: z.string().min(1),
  region: z.string().default("GLOBAL"),
  failoverTarget: z.string().nullable().optional(),
  runbookId: z.string().min(1),
});
export type ReliabilityDependency = z.infer<typeof reliabilityDependencySchema>;

// ==========================================
// 3. Platform Incident
// ==========================================

export const platformIncidentSchema = z.object({
  id: z.string().min(1),
  severity: incidentSeveritySchema,
  scope: z.string().min(1), // e.g. "postgres", "redis", "provider:openai", "region:eu"
  status: incidentStatusSchema,
  summary: z.string().min(1),
  mitigationActions: z.array(z.string()).default([]),
  startedAt: z.coerce.date(),
  resolvedAt: z.coerce.date().nullable().optional(),
});
export type PlatformIncident = z.infer<typeof platformIncidentSchema>;

// ==========================================
// 4. Recovery Runs & Invariant Verifications
// ==========================================

export const recoveryRunTypeSchema = z.enum([
  "db_restore_drill",
  "object_restore_drill",
  "redis_cold_rebuild",
  "region_failover_drill",
  "reconciliation_run",
]);
export type RecoveryRunType = z.infer<typeof recoveryRunTypeSchema>;

export const invariantStatusSchema = z.enum(["passed", "failed", "warning"]);
export type InvariantStatus = z.infer<typeof invariantStatusSchema>;

export const criticalInvariantResultSchema = z.object({
  checkName: z.string().min(1),
  status: invariantStatusSchema,
  details: z.string().min(1),
  recordsEvaluated: z.number().int().nonnegative().default(0),
  discrepanciesFound: z.number().int().nonnegative().default(0),
});
export type CriticalInvariantResult = z.infer<
  typeof criticalInvariantResultSchema
>;

export const recoveryRunSchema = z.object({
  id: z.string().min(1),
  type: recoveryRunTypeSchema,
  scope: z.string().min(1),
  status: z.enum(["pending", "running", "passed", "failed"]),
  startedBy: z.string().min(1),
  startedAt: z.coerce.date(),
  completedAt: z.coerce.date().nullable().optional(),
  observedRpoSeconds: z.number().nonnegative().nullable().optional(),
  observedRtoSeconds: z.number().nonnegative().nullable().optional(),
  evidenceSummary: z.string().optional(),
  invariants: z.array(criticalInvariantResultSchema).default([]),
});
export type RecoveryRun = z.infer<typeof recoveryRunSchema>;

// ==========================================
// 5. Capability Readiness Status
// ==========================================

export const capabilityReadinessSchema = z.object({
  textInferenceReady: z.boolean(),
  fileInferenceReady: z.boolean(),
  batchReady: z.boolean(),
  billingReady: z.boolean(),
  multimodalReady: z.boolean(),
  providerOpsReady: z.boolean(),
  operationalMode: platformOperationalModeSchema,
});
export type CapabilityReadiness = z.infer<typeof capabilityReadinessSchema>;
