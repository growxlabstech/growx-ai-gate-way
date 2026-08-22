import type {
  CanonicalCapability,
  CanonicalModelStatus,
  InputModality,
  ModelCategory,
  OutputModality,
  ProviderRouteStatus,
  AliasStatus,
  AliasType,
  PricingType,
  PricingSource,
} from "@growx/contracts";

export interface CanonicalModelEntity {
  id: string;
  canonicalId: string;
  displayName: string;
  family: string;
  category: ModelCategory;
  status: CanonicalModelStatus;
  customerVisible: boolean;
  routingEligible: boolean;
  description: string;
  contextWindow: number;
  maxInputTokens?: number | null | undefined;
  maxOutputTokens: number;
  supportsStreaming: boolean;
  supportsTools: boolean;
  supportsStructuredOutput: boolean;
  supportsReasoning: boolean;
  inputModalities: InputModality[];
  outputModalities: OutputModality[];
  capabilities: CanonicalCapability[];
  reasoningMetadata?: Record<string, unknown> | null | undefined;
  toolMetadata?: Record<string, unknown> | null | undefined;
  structuredOutputMetadata?: Record<string, unknown> | null | undefined;
  deprecatedAt?: Date | null | undefined;
  sunsetAt?: Date | null | undefined;
  replacementModelId?: string | null | undefined;
  deprecationMessage?: string | null | undefined;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProviderRouteEntity {
  id: string;
  modelId: string;
  canonicalModelId: string;
  providerId: string;
  providerModelId: string;
  region: string;
  status: ProviderRouteStatus;
  routingEligible: boolean;
  priority: number;
  contextWindowOverride?: number | null | undefined;
  maxOutputTokensOverride?: number | null | undefined;
  capabilitiesOverrides?: CanonicalCapability[] | null | undefined;
  pricingReference?: string | null | undefined;
  availableFrom?: Date | null | undefined;
  deprecatedAt?: Date | null | undefined;
  retiredAt?: Date | null | undefined;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface ModelAliasEntity {
  id: string;
  alias: string;
  canonicalModelId: string;
  status: AliasStatus;
  type: AliasType;
  description?: string | null | undefined;
  createdAt: Date;
  updatedAt: Date;
  retiredAt?: Date | null | undefined;
}

export interface ModelPricingEntity {
  id: string;
  modelId?: string | null | undefined;
  routeId?: string | null | undefined;
  pricingType: PricingType;
  inputPricePerMillionMinor: number;
  outputPricePerMillionMinor: number;
  cachedInputPricePerMillionMinor?: number | null | undefined;
  reasoningPricePerMillionMinor?: number | null | undefined;
  currency: string;
  effectiveFrom: Date;
  effectiveTo?: Date | null | undefined;
  source: PricingSource;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export interface ResolvedModelContext {
  requestedModelId: string;
  canonicalModelId: string;
  aliasUsed?:
    | {
        alias: string;
        type: AliasType;
      }
    | undefined;
  model: CanonicalModelEntity;
  capabilities: CanonicalCapability[];
  limits: {
    contextWindow: number;
    maxInputTokens: number | null;
    maxOutputTokens: number;
  };
  eligibleConfiguredRoutes: ProviderRouteEntity[];
  isExecutable: boolean;
  deprecation?:
    | {
        deprecatedAt: string | null;
        sunsetAt: string | null;
        replacementModelId: string | null;
        message: string | null;
      }
    | undefined;
}
