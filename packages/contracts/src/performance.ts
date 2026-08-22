import { z } from "zod";

// ==========================================
// 1. Performance Metric Snapshot
// ==========================================

export const performanceMetricSnapshotSchema = z.object({
  requestCount: z.number().int().nonnegative(),
  concurrency: z.number().int().nonnegative(),
  rps: z.number().nonnegative(),
  p50Ms: z.number().nonnegative(),
  p75Ms: z.number().nonnegative().optional(),
  p90Ms: z.number().nonnegative(),
  p95Ms: z.number().nonnegative(),
  p99Ms: z.number().nonnegative(),
  growxOverheadP95Ms: z.number().nonnegative(),
  providerLatencyP95Ms: z.number().nonnegative(),
  errorRate: z.number().min(0).max(1),
  eventLoopLagMs: z.number().nonnegative().default(0),
  heapUsedMb: z.number().nonnegative().default(0),
  gcDurationMs: z.number().nonnegative().default(0),
});
export type PerformanceMetricSnapshot = z.infer<
  typeof performanceMetricSnapshotSchema
>;

// ==========================================
// 2. Performance Run & Benchmarks
// ==========================================

export const performanceScenarioSchema = z.enum([
  "smoke_1k",
  "standard_10k",
  "scale_100k",
  "streaming_concurrency",
  "noisy_neighbor_fairness",
  "cold_start",
  "slow_client_backpressure",
]);
export type PerformanceScenario = z.infer<typeof performanceScenarioSchema>;

export const performanceRunSchema = z.object({
  id: z.string().min(1),
  scenario: performanceScenarioSchema,
  version: z.string().default("1.0"),
  environment: z.string().default("test_sandbox"),
  startedAt: z.coerce.date(),
  completedAt: z.coerce.date().nullable().optional(),
  metrics: performanceMetricSnapshotSchema,
  bottlenecks: z.array(z.string()).default([]),
  verdict: z.enum(["PASSED", "DEGRADED", "FAILED"]),
});
export type PerformanceRun = z.infer<typeof performanceRunSchema>;

// ==========================================
// 3. Language Migration Evaluation
// ==========================================

export const workloadTypeSchema = z.enum([
  "io_bound",
  "cpu_bound",
  "db_bound",
  "provider_bound",
  "connection_density_bound",
]);
export type WorkloadType = z.infer<typeof workloadTypeSchema>;

export const migrationDecisionSchema = z.enum([
  "KEEP_TYPESCRIPT",
  "OPTIMIZE_TYPESCRIPT",
  "MOVE_TO_GO_CANDIDATE",
  "MOVE_TO_RUST_CANDIDATE",
  "INSUFFICIENT_EVIDENCE",
]);
export type MigrationDecision = z.infer<typeof migrationDecisionSchema>;

export const languageMigrationEvaluationSchema = z.object({
  serviceName: z.string().min(1),
  currentLanguage: z.string().default("TypeScript"),
  workloadType: workloadTypeSchema,
  decision: migrationDecisionSchema,
  reason: z.string().min(1),
  measuredBottleneck: z.string().optional(),
  observedEventLoopLagMs: z.number().nonnegative().optional(),
  memoryPerConnKb: z.number().nonnegative().optional(),
});
export type LanguageMigrationEvaluation = z.infer<
  typeof languageMigrationEvaluationSchema
>;

// ==========================================
// 4. Admission Control
// ==========================================

export const admissionDecisionSchema = z.object({
  allowed: z.boolean(),
  reason: z.string().optional(),
  tenantWeight: z.number().positive().default(1),
  shedPriority: z
    .enum(["CRITICAL", "STANDARD", "BATCH", "BACKGROUND"])
    .default("STANDARD"),
  retryAfterMs: z.number().int().nonnegative().optional(),
});
export type AdmissionDecision = z.infer<typeof admissionDecisionSchema>;
