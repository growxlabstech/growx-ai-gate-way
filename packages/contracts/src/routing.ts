import { z } from "zod";
import {
  canonicalCapabilitySchema,
  inputModalitySchema,
  outputModalitySchema,
} from "./ai.js";

export const routingWorkloadTypeSchema = z.enum([
  "realtime_interactive",
  "realtime_background",
  "batch",
  "embedding",
  "image",
  "audio",
  "document",
  "reasoning",
  "tool_call",
  "structured_generation",
]);
export type RoutingWorkloadType = z.infer<typeof routingWorkloadTypeSchema>;

export const routingLatencyClassSchema = z.enum([
  "ultra_low",
  "interactive",
  "standard",
  "throughput",
]);
export type RoutingLatencyClass = z.infer<typeof routingLatencyClassSchema>;

export const routingObjectiveSchema = z.enum([
  "balanced",
  "lowest_latency",
  "lowest_cost",
  "highest_reliability",
  "highest_throughput",
  "pinned",
  "custom_policy",
]);
export type RoutingObjective = z.infer<typeof routingObjectiveSchema>;

export const routeTrafficModeSchema = z.enum([
  "active",
  "draining",
  "disabled",
  "canary",
]);
export type RouteTrafficMode = z.infer<typeof routeTrafficModeSchema>;

export const requestCapabilityProfileSchema = z.object({
  canonicalModelId: z.string().min(1),
  workloadType: routingWorkloadTypeSchema.default("realtime_interactive"),
  streaming: z.boolean().default(false),
  inputModalities: z.array(inputModalitySchema).default(["text"]),
  outputModalities: z.array(outputModalitySchema).default(["text"]),
  toolCalling: z.boolean().default(false),
  structuredOutput: z.boolean().default(false),
  reasoningMode: z.boolean().optional(),
  contextTokensEstimated: z.number().int().nonnegative().optional(),
  maxOutputTokens: z.number().int().nonnegative().optional(),
  batch: z.boolean().default(false),
  latencyClass: routingLatencyClassSchema.default("interactive"),
  regionRequirement: z.string().optional(),
  dataResidencyRequirement: z.string().optional(),
  requiredDataRegion: z.enum(["IN", "EU", "US", "APAC", "GLOBAL"]).optional(),
  prohibitProviderTraining: z.boolean().default(false).optional(),
  maximumProviderRetention: z.number().int().nonnegative().optional(),
  zeroRetentionRequired: z.boolean().default(false).optional(),
  sensitiveDataClass: z.string().optional(),
  providerPreference: z.string().optional(),
  requiredProvider: z.string().optional(),
  maxExecutionCostMinor: z.number().int().nonnegative().optional(),
  embeddingDimensions: z.number().int().positive().optional(),
  embeddingEncoding: z.enum(["float", "base64"]).optional(),
  batchItemCount: z.number().int().positive().optional(),
  inputTokenEstimate: z.number().int().nonnegative().optional(),
  imageGeneration: z.boolean().default(false),
  imageEdit: z.boolean().default(false),
  transcription: z.boolean().default(false),
  speech: z.boolean().default(false),
  audioInput: z.boolean().default(false),
  mediaCount: z.number().int().nonnegative().optional(),
  estimatedMediaBytes: z.number().int().nonnegative().optional(),
  audioDuration: z.number().nonnegative().optional(),
  requestedImageSize: z.string().optional(),
  requestedImageQuality: z.string().optional(),
  requestedVoice: z.string().optional(),
  requestedAudioFormat: z.string().optional(),
  policyId: z.string().optional(),
});
export type RequestCapabilityProfile = z.infer<
  typeof requestCapabilityProfileSchema
>;

export const routeScoreDetailsSchema = z.object({
  candidateId: z.string(),
  routeId: z.string(),
  providerId: z.string(),
  totalScore: z.number().min(0).max(100),
  latencyScore: z.number().min(0).max(100),
  costScore: z.number().min(0).max(100),
  reliabilityScore: z.number().min(0).max(100),
  capacityScore: z.number().min(0).max(100),
  localityScore: z.number().min(0).max(100),
  policyAdjustment: z.number().default(0),
  reasons: z.array(z.string()).default([]),
});
export type RouteScoreDetails = z.infer<typeof routeScoreDetailsSchema>;

export const failureDomainInfoSchema = z.object({
  routeId: z.string(),
  providerId: z.string(),
  credentialId: z.string().optional(),
  accountPoolId: z.string().optional(),
  region: z.string().default("global"),
});
export type FailureDomainInfo = z.infer<typeof failureDomainInfoSchema>;

export const rankedCandidateRecordSchema = z.object({
  routeId: z.string(),
  providerId: z.string(),
  providerModelId: z.string(),
  region: z.string(),
  rank: z.number().int().positive(),
  eligible: z.boolean(),
  rejectionReason: z.string().optional(),
  score: routeScoreDetailsSchema.optional(),
  estimatedCostMinor: z.number().optional(),
  estimatedLatencyMs: z.number().optional(),
  failureDomain: failureDomainInfoSchema,
});
export type RankedCandidateRecord = z.infer<typeof rankedCandidateRecordSchema>;

export const routingPlanSchema = z.object({
  selectedRouteId: z.string(),
  selectedCandidate: rankedCandidateRecordSchema,
  fallbacks: z.array(rankedCandidateRecordSchema),
  policyVersion: z.number().int().default(1),
  objective: routingObjectiveSchema,
  requestProfileHash: z.string(),
  routerVersion: z.string().default("v2"),
});
export type RoutingPlan = z.infer<typeof routingPlanSchema>;

export const routingDecisionV2Schema = z.object({
  id: z.string(),
  requestId: z.string(),
  routerVersion: z.string().default("v2"),
  policyVersion: z.number().int().default(1),
  objective: routingObjectiveSchema,
  requestProfileHash: z.string(),
  selectedRouteId: z.string(),
  selectedRank: z.number().int().positive(),
  candidateCount: z.number().int().nonnegative(),
  decisionReason: z.string(),
  topCandidates: z.array(rankedCandidateRecordSchema).optional(),
  shadowDecision: z.record(z.string(), z.unknown()).optional(),
  createdAt: z.coerce.date(),
});
export type RoutingDecisionV2 = z.infer<typeof routingDecisionV2Schema>;

export const routeTrafficControlSchema = z.object({
  id: z.string(),
  routeId: z.string(),
  mode: routeTrafficModeSchema.default("active"),
  maxTrafficPercent: z.number().int().min(0).max(100).default(100),
  drain: z.boolean().default(false),
  disabled: z.boolean().default(false),
  reason: z.string().optional(),
  updatedBy: z.string().optional(),
  version: z.number().int().default(1),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type RouteTrafficControl = z.infer<typeof routeTrafficControlSchema>;

export const routingPolicyWeightsSchema = z.object({
  latency: z.number().min(0).max(1).default(0.3),
  cost: z.number().min(0).max(1).default(0.25),
  reliability: z.number().min(0).max(1).default(0.25),
  capacity: z.number().min(0).max(1).default(0.1),
  locality: z.number().min(0).max(1).default(0.1),
});
export type RoutingPolicyWeights = z.infer<typeof routingPolicyWeightsSchema>;

export const routingPolicyConstraintsSchema = z.object({
  allowedProviders: z.array(z.string()).optional(),
  deniedProviders: z.array(z.string()).optional(),
  allowedRegions: z.array(z.string()).optional(),
  dataResidency: z.string().optional(),
  maxExecutionCostMinor: z.number().int().nonnegative().optional(),
  requireStreaming: z.boolean().optional(),
  allowCanaryRoutes: z.boolean().default(true),
  explorationRate: z.number().min(0).max(0.2).default(0.02),
});
export type RoutingPolicyConstraints = z.infer<
  typeof routingPolicyConstraintsSchema
>;

export const routingPolicyV2Schema = z.object({
  id: z.string(),
  organizationId: z.string().nullable().optional(),
  workspaceId: z.string().nullable().optional(),
  name: z.string().min(1).max(100),
  objective: routingObjectiveSchema.default("balanced"),
  weights: routingPolicyWeightsSchema.default({
    latency: 0.3,
    cost: 0.25,
    reliability: 0.25,
    capacity: 0.1,
    locality: 0.1,
  }),
  constraints: routingPolicyConstraintsSchema.default({
    allowCanaryRoutes: true,
    explorationRate: 0.02,
  }),
  version: z.number().int().positive().default(1),
  status: z.enum(["draft", "active", "retired"]).default("active"),
  effectiveFrom: z.coerce.date().default(() => new Date()),
  effectiveUntil: z.coerce.date().nullable().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type RoutingPolicyV2 = z.infer<typeof routingPolicyV2Schema>;

export const createRoutingPolicyRequestSchema = z.object({
  organizationId: z.string().optional(),
  workspaceId: z.string().optional(),
  name: z.string().min(1).max(100),
  objective: routingObjectiveSchema.default("balanced"),
  weights: routingPolicyWeightsSchema.optional(),
  constraints: routingPolicyConstraintsSchema.optional(),
});
export type CreateRoutingPolicyRequest = z.infer<
  typeof createRoutingPolicyRequestSchema
>;

export const updateRoutingPolicyRequestSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  objective: routingObjectiveSchema.optional(),
  weights: routingPolicyWeightsSchema.optional(),
  constraints: routingPolicyConstraintsSchema.optional(),
  status: z.enum(["draft", "active", "retired"]).optional(),
});
export type UpdateRoutingPolicyRequest = z.infer<
  typeof updateRoutingPolicyRequestSchema
>;

export const routingSimulationRequestSchema = z.object({
  profile: requestCapabilityProfileSchema,
  objective: routingObjectiveSchema.optional(),
  customWeights: routingPolicyWeightsSchema.optional(),
  customConstraints: routingPolicyConstraintsSchema.optional(),
});
export type RoutingSimulationRequest = z.infer<
  typeof routingSimulationRequestSchema
>;

export const routingSimulationResponseSchema = z.object({
  profile: requestCapabilityProfileSchema,
  objective: routingObjectiveSchema,
  totalCandidatesConsidered: z.number().int().nonnegative(),
  eligibleCandidatesCount: z.number().int().nonnegative(),
  rejectedCandidatesCount: z.number().int().nonnegative(),
  selectedRouteId: z.string().nullable(),
  selectedCandidate: rankedCandidateRecordSchema.nullable(),
  rankedCandidates: z.array(rankedCandidateRecordSchema),
  fallbackChain: z.array(rankedCandidateRecordSchema),
  decisionReason: z.string(),
  simulatedAt: z.coerce.date(),
});
export type RoutingSimulationResponse = z.infer<
  typeof routingSimulationResponseSchema
>;
