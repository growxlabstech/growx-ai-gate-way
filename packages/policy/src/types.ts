import { z } from "zod";
import type { CanonicalCapability, ProviderErrorCode } from "@growx/contracts";

export const policyScopeTypeSchema = z.enum([
  "global",
  "organization",
  "workspace",
  "api_key",
]);
export type PolicyScopeType = z.infer<typeof policyScopeTypeSchema>;

export const policyStatusSchema = z.enum([
  "draft",
  "active",
  "disabled",
  "archived",
]);
export type PolicyStatus = z.infer<typeof policyStatusSchema>;

export const dataClassificationSchema = z.enum([
  "public",
  "internal",
  "confidential",
  "restricted",
]);
export type DataClassification = z.infer<typeof dataClassificationSchema>;

export const dataClassificationSourceSchema = z.enum([
  "workspace_default",
  "api_key_default",
  "trusted_metadata",
]);
export type DataClassificationSource = z.infer<
  typeof dataClassificationSourceSchema
>;

export const policyRuleOperatorSchema = z.enum([
  "equals",
  "not_equals",
  "in",
  "not_in",
  "contains",
  "less_than",
  "less_than_or_equal",
  "greater_than",
  "greater_than_or_equal",
]);
export type PolicyRuleOperator = z.infer<typeof policyRuleOperatorSchema>;

export const policyRuleEffectSchema = z.enum(["allow", "deny"]);
export type PolicyRuleEffect = z.infer<typeof policyRuleEffectSchema>;

export const policyTargetDimensionSchema = z.enum([
  "model",
  "model_family",
  "model_category",
  "provider",
  "region",
  "data_residency",
  "input_modality",
  "output_modality",
  "tools",
  "tool_name",
  "parallel_tools",
  "max_tools",
  "structured_output",
  "reasoning",
  "max_reasoning_tokens",
  "max_output_tokens",
  "temperature",
  "data_classification",
  "provider_tag",
  "max_cost_per_request",
]);
export type PolicyTargetDimension = z.infer<typeof policyTargetDimensionSchema>;

export const policyDenialCodeSchema = z.enum([
  "MODEL_DENIED",
  "MODEL_CATEGORY_DENIED",
  "MODEL_FAMILY_DENIED",
  "PROVIDER_DENIED",
  "REGION_DENIED",
  "DATA_RESIDENCY_DENIED",
  "MODALITY_DENIED",
  "TOOLS_DENIED",
  "TOOL_DENIED",
  "STRUCTURED_OUTPUT_DENIED",
  "REASONING_DENIED",
  "REQUEST_LIMIT_DENIED",
  "COST_POLICY_DENIED",
  "DATA_POLICY_DENIED",
  "PROVIDER_TAG_DENIED",
]);
export type PolicyDenialCode = z.infer<typeof policyDenialCodeSchema>;

export const policyRuleSchema = z.object({
  id: z.string().optional(),
  target: policyTargetDimensionSchema,
  effect: policyRuleEffectSchema,
  operator: policyRuleOperatorSchema,
  value: z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.array(z.string()),
    z.array(z.number()),
  ]),
  description: z.string().max(512).optional(),
});
export type PolicyRule = z.infer<typeof policyRuleSchema>;

export const policyDefinitionSchema = z.object({
  rules: z.array(policyRuleSchema).max(500),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type PolicyDefinition = z.infer<typeof policyDefinitionSchema>;

export interface PolicyEntity {
  id: string;
  scopeType: PolicyScopeType;
  scopeId: string | null;
  name: string;
  description?: string | undefined;
  status: PolicyStatus;
  activeVersion: number;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PolicyVersionEntity {
  id: string;
  policyId: string;
  version: number;
  definition: PolicyDefinition;
  effectiveFrom?: Date | null | undefined;
  effectiveTo?: Date | null | undefined;
  createdBy: string;
  createdAt: Date;
}

export interface MatchedPolicyRule {
  policyId?: string | undefined;
  scopeType: PolicyScopeType;
  target: PolicyTargetDimension;
  effect: PolicyRuleEffect;
  operator: PolicyRuleOperator;
  value: unknown;
  reason: string;
}

export interface EffectivePolicyConstraints {
  allowedModels?: string[] | undefined;
  deniedModels?: string[] | undefined;
  allowedModelFamilies?: string[] | undefined;
  deniedModelFamilies?: string[] | undefined;
  allowedModelCategories?: string[] | undefined;
  deniedModelCategories?: string[] | undefined;
  allowedProviders?: string[] | undefined;
  deniedProviders?: string[] | undefined;
  allowedRegions?: string[] | undefined;
  deniedRegions?: string[] | undefined;
  requiredDataResidency?: string | undefined;
  requiredProviderTags?: string[] | undefined;
  allowedInputModalities?: string[] | undefined;
  deniedInputModalities?: string[] | undefined;
  allowedOutputModalities?: string[] | undefined;
  deniedOutputModalities?: string[] | undefined;
  toolsAllowed?: boolean | undefined;
  allowedToolNames?: string[] | undefined;
  deniedToolNames?: string[] | undefined;
  maxToolCount?: number | undefined;
  parallelToolsAllowed?: boolean | undefined;
  structuredOutputAllowed?: boolean | undefined;
  reasoningAllowed?: boolean | undefined;
  maxReasoningTokens?: number | undefined;
  maxOutputTokens?: number | undefined;
  temperatureMin?: number | undefined;
  temperatureMax?: number | undefined;
  maxEstimatedCostPerRequest?: number | undefined;
  allowedDataClassifications?: DataClassification[] | undefined;
  deniedDataClassifications?: DataClassification[] | undefined;
}

export interface EffectivePolicy {
  versionHash: string;
  policyVersions: Record<string, number>;
  rules: PolicyRule[];
  constraints: EffectivePolicyConstraints;
  compiledAt: Date;
}

export interface PolicyEvaluationContext {
  actor?: { id: string; type: string } | undefined;
  organizationId: string;
  workspaceId: string;
  apiKeyId?: string | undefined;
  environment?: string | undefined;
  requestedModel: string;
  canonicalModel: {
    id: string;
    canonicalId: string;
    family?: string | undefined;
    category?: string | undefined;
    inputModalities?: string[] | undefined;
    outputModalities?: string[] | undefined;
    contextWindow?: number | undefined;
    maxOutputTokens?: number | undefined;
  };
  requestCapabilities?: string[] | undefined;
  inputModalities?: string[] | undefined;
  outputModalities?: string[] | undefined;
  tools?: Array<{ type: string; function?: { name: string } }> | undefined;
  toolChoice?: unknown | undefined;
  parallelToolCalls?: boolean | undefined;
  structuredOutput?:
    | {
        type: "json_object" | "json_schema";
        strict?: boolean | undefined;
        schemaName?: string | undefined;
      }
    | undefined;
  reasoning?:
    | {
        effort?: string | undefined;
        maxTokens?: number | undefined;
      }
    | undefined;
  temperature?: number | undefined;
  maxTokens?: number | undefined;
  estimatedInputTokens?: number | undefined;
  estimatedOutputTokens?: number | undefined;
  estimatedProviderCost?: number | undefined;
  dataClassification?: DataClassification | undefined;
  dataClassificationSource?: DataClassificationSource | undefined;
  metadata?: Record<string, unknown> | undefined;
}

export interface PolicyDecision {
  allowed: boolean;
  policyVersionSet: Record<string, number>;
  versionHash: string;
  reasons: string[];
  denialCode?: PolicyDenialCode | undefined;
  deniedByScope?: PolicyScopeType | undefined;
  matchedRules?: MatchedPolicyRule[] | undefined;
  constraints?: EffectivePolicyConstraints | undefined;
  evaluatedAt: Date;
}

export interface RouteCandidateForPolicy {
  routeId: string;
  providerId: string;
  providerModelId: string;
  region?: string | undefined;
  tags?: string[] | undefined;
  complianceTags?: string[] | undefined;
  estimatedCost?: number | undefined;
}

export interface BatchRoutePolicyEvaluationResult {
  eligible: RouteCandidateForPolicy[];
  excluded: Array<{
    candidate: RouteCandidateForPolicy;
    reason: string;
    denialCode: PolicyDenialCode;
  }>;
}
