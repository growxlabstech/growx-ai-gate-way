import { z } from "zod";

// ==========================================
// 1. Runtime Targets & Canary Stages
// ==========================================

export const runtimeTargetSchema = z.enum([
  "typescript",
  "go_runtime",
  "rust_tokenizer",
  "shadow_evaluator",
]);
export type RuntimeTarget = z.infer<typeof runtimeTargetSchema>;

export const canaryStageSchema = z.enum([
  "0_disabled",
  "1_shadow",
  "2_canary_1pct",
  "3_canary_5pct",
  "4_canary_10pct",
  "5_canary_25pct",
  "6_canary_50pct",
  "7_full_cutover",
]);
export type CanaryStage = z.infer<typeof canaryStageSchema>;

// ==========================================
// 2. Runtime Routing Policy
// ==========================================

export const runtimeRoutingPolicySchema = z.object({
  target: runtimeTargetSchema,
  stage: canaryStageSchema.default("0_disabled"),
  canaryPercentage: z.number().min(0).max(100).default(0),
  allowedOrganizations: z.array(z.string()).default([]),
  allowedModels: z.array(z.string()).default([]),
  fallbackTarget: runtimeTargetSchema.default("typescript"),
  rollbackOnErrorSpike: z.boolean().default(true),
  errorThresholdRatio: z.number().min(0).max(1).default(0.02), // 2% error threshold
  status: z.enum(["active", "rolling_back", "disabled"]).default("active"),
});
export type RuntimeRoutingPolicy = z.infer<typeof runtimeRoutingPolicySchema>;

// ==========================================
// 3. Shadow Comparison & Mismatch
// ==========================================

export const shadowMismatchTypeSchema = z.enum([
  "none",
  "latency",
  "payload",
  "token_count",
  "error_code",
  "structured_schema",
]);
export type ShadowMismatchType = z.infer<typeof shadowMismatchTypeSchema>;

export const shadowComparisonResultSchema = z.object({
  requestId: z.string().min(1),
  primaryTarget: runtimeTargetSchema,
  shadowTarget: runtimeTargetSchema,
  matches: z.boolean(),
  mismatchType: shadowMismatchTypeSchema.default("none"),
  details: z.string().optional(),
  primaryLatencyMs: z.number().nonnegative(),
  shadowLatencyMs: z.number().nonnegative(),
  primaryTokenCount: z.number().int().nonnegative().optional(),
  shadowTokenCount: z.number().int().nonnegative().optional(),
  evaluatedAt: z.coerce.date(),
});
export type ShadowComparisonResult = z.infer<
  typeof shadowComparisonResultSchema
>;

// ==========================================
// 4. Runtime Execution Result Model
// ==========================================

export const runtimeExecutionResultSchema = z.object({
  id: z.string().min(1),
  runtime: runtimeTargetSchema,
  status: z.enum(["success", "error", "fallback"]),
  content: z.string().optional(),
  rawPayloadHash: z.string().optional(),
  inputTokens: z.number().int().nonnegative().default(0),
  outputTokens: z.number().int().nonnegative().default(0),
  durationMs: z.number().nonnegative(),
  errorCode: z.string().optional(),
  errorMessage: z.string().optional(),
});
export type RuntimeExecutionResult = z.infer<
  typeof runtimeExecutionResultSchema
>;
