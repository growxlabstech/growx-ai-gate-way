import { z } from "zod";

// ==========================================
// 1. Deployment Environments & Status
// ==========================================

export const deploymentEnvironmentSchema = z.enum([
  "development",
  "staging",
  "production",
]);
export type DeploymentEnvironment = z.infer<typeof deploymentEnvironmentSchema>;

export const releaseStatusSchema = z.enum([
  "pending",
  "migrating",
  "staging_smoke",
  "canary",
  "deployed",
  "rolled_back",
  "failed",
]);
export type ReleaseStatus = z.infer<typeof releaseStatusSchema>;

// ==========================================
// 2. Deployment Release Record
// ==========================================

export const smokeTestResultSchema = z.object({
  name: z.string().min(1),
  status: z.enum(["passed", "failed", "skipped"]),
  durationMs: z.number().nonnegative(),
  isSynthetic: z.boolean().default(true),
  error: z.string().optional(),
});
export type SmokeTestResult = z.infer<typeof smokeTestResultSchema>;

export const deploymentReleaseSchema = z.object({
  id: z.string().min(1),
  version: z.string().min(1),
  gitSha: z.string().min(1),
  environment: deploymentEnvironmentSchema,
  status: releaseStatusSchema.default("pending"),
  createdAt: z.coerce.date(),
  deployedAt: z.coerce.date().nullable().optional(),
  smokeResults: z.array(smokeTestResultSchema).default([]),
  rollbackReason: z.string().optional(),
});
export type DeploymentRelease = z.infer<typeof deploymentReleaseSchema>;

// ==========================================
// 3. Deployment Configuration
// ==========================================

export const deploymentTopologyConfigSchema = z.object({
  apiHostname: z.string().default("api.growxlabs.tech"),
  consoleHostname: z.string().default("app.growxlabs.tech"),
  databasePoolSize: z.number().int().positive().default(20),
  workerConcurrency: z.number().int().positive().default(10),
  corsAllowedOrigins: z.array(z.string()).default(["https://app.growxlabs.tech"]),
  enablePersistentRuntime: z.boolean().default(true),
});
export type DeploymentTopologyConfig = z.infer<typeof deploymentTopologyConfigSchema>;
