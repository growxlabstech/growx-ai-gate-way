import {
  type RequestCapabilityProfile,
  type CanonicalCapability,
} from "@growx/contracts";
import type { RouteCandidate } from "./types.js";

export interface RouteCandidateFilterResult {
  candidate: RouteCandidate;
  eligible: boolean;
  rejectionReason?: string | undefined;
}

export interface HardConstraintFilterOptions {
  allowedProviders?: string[] | undefined;
  deniedProviders?: string[] | undefined;
  allowedRegions?: string[] | undefined;
  dataResidency?: string | undefined;
  maxExecutionCostMinor?: number | undefined;
}

export class HardConstraintFilter {
  public static filterCandidates(
    candidates: RouteCandidate[],
    profile: RequestCapabilityProfile,
    options: HardConstraintFilterOptions = {}
  ): { eligible: RouteCandidate[]; rejected: RouteCandidateFilterResult[] } {
    const eligible: RouteCandidate[] = [];
    const rejected: RouteCandidateFilterResult[] = [];

    for (const candidate of candidates) {
      const evaluation = this.evaluateCandidate(candidate, profile, options);
      if (evaluation.eligible) {
        eligible.push(candidate);
      } else {
        rejected.push(evaluation);
      }
    }

    return { eligible, rejected };
  }

  public static evaluateCandidate(
    candidate: RouteCandidate,
    profile: RequestCapabilityProfile,
    options: HardConstraintFilterOptions = {}
  ): RouteCandidateFilterResult {
    // 1. Status Check
    // Account & Credential status checks (Phase 28)
    if (candidate.accountStatus && candidate.accountStatus !== "active") {
      return { candidate, eligible: false, rejectionReason: "ACCOUNT_STATUS_INACTIVE" };
    }
    if (candidate.credentialStatus && candidate.credentialStatus !== "active") {
      return { candidate, eligible: false, rejectionReason: "CREDENTIAL_STATUS_INACTIVE" };
    }

    if (candidate.routeStatus !== "active") {
      return { candidate, eligible: false, rejectionReason: "ROUTE_STATUS_INACTIVE" };
    }
    if (candidate.providerStatus !== "active") {
      return { candidate, eligible: false, rejectionReason: "PROVIDER_STATUS_INACTIVE" };
    }
    if (candidate.routingEligible === false) {
      return { candidate, eligible: false, rejectionReason: "ROUTING_INELIGIBLE" };
    }
    if (candidate.hasActiveCredential === false) {
      return { candidate, eligible: false, rejectionReason: "NO_ACTIVE_CREDENTIAL" };
    }

    // 2. Circuit Breaker Check
    if (candidate.circuit === "OPEN") {
      return { candidate, eligible: false, rejectionReason: "CIRCUIT_OPEN" };
    }
    if (candidate.circuit === "FORCED_OPEN") {
      return { candidate, eligible: false, rejectionReason: "CIRCUIT_FORCED_OPEN" };
    }

    // 3. Provider Rules Check
    if (profile.requiredProvider && candidate.providerId !== profile.requiredProvider) {
      return { candidate, eligible: false, rejectionReason: "PROVIDER_NOT_MATCHING_REQUIRED" };
    }
    if (options.deniedProviders && options.deniedProviders.includes(candidate.providerId)) {
      return { candidate, eligible: false, rejectionReason: "PROVIDER_DENIED" };
    }
    if (options.allowedProviders && options.allowedProviders.length > 0 && !options.allowedProviders.includes(candidate.providerId)) {
      return { candidate, eligible: false, rejectionReason: "PROVIDER_NOT_ALLOWED" };
    }

    // 4. Data Residency & Region Constraints
    const targetResidency = options.dataResidency || profile.dataResidencyRequirement || profile.requiredDataRegion;
    if (targetResidency) {
      const candRegion = (candidate.region || "").toLowerCase();
      const res = targetResidency.toLowerCase();

      if ((res === "in" || res === "india") && !candRegion.includes("south-1") && !candRegion.includes("india") && !candRegion.includes("bom") && candRegion !== "in") {
        return { candidate, eligible: false, rejectionReason: "DATA_RESIDENCY_MISMATCH" };
      }
      if ((res === "eu" || res === "europe") && !candRegion.includes("eu-") && !candRegion.includes("europe") && !candRegion.includes("fra") && !candRegion.includes("dub") && candRegion !== "eu") {
        return { candidate, eligible: false, rejectionReason: "DATA_RESIDENCY_MISMATCH" };
      }
      if ((res === "us" || res === "america") && !candRegion.includes("us-") && !candRegion.includes("america") && !candRegion.includes("iad") && !candRegion.includes("sfo") && candRegion !== "us") {
        return { candidate, eligible: false, rejectionReason: "DATA_RESIDENCY_MISMATCH" };
      }
      if ((res === "apac") && !candRegion.includes("ap-") && !candRegion.includes("apac") && !candRegion.includes("singapore") && !candRegion.includes("tokyo") && candRegion !== "apac") {
        return { candidate, eligible: false, rejectionReason: "DATA_RESIDENCY_MISMATCH" };
      }
    }

    // 5. Allowed Regions
    if (options.allowedRegions && options.allowedRegions.length > 0) {
      const candRegion = (candidate.region || "").toLowerCase();
      if (!options.allowedRegions.some(r => r.toLowerCase() === candRegion || candRegion === "global")) {
        return { candidate, eligible: false, rejectionReason: "REGION_NOT_ALLOWED" };
      }
    }

    // Phase 35 Governance Policy Hard Checks
    const candidateDataPolicy = (candidate as any).dataPolicy;
    if (profile.prohibitProviderTraining && candidateDataPolicy?.trainingBehavior === "permitted") {
      return { candidate, eligible: false, rejectionReason: "PROVIDER_TRAINING_PROHIBITED" };
    }
    if (profile.zeroRetentionRequired && candidateDataPolicy?.zeroRetentionCapability === false) {
      return { candidate, eligible: false, rejectionReason: "ZERO_RETENTION_NOT_SUPPORTED" };
    }

    // 6. Capability Checks
    const caps = Array.isArray(candidate.capabilities)
      ? candidate.capabilities
      : candidate.capabilities
      ? Array.from(candidate.capabilities as any)
      : [];

    if (profile.streaming && !caps.includes("streaming" as any) && !caps.includes("chat.stream" as any)) {
      return { candidate, eligible: false, rejectionReason: "STREAMING_NOT_SUPPORTED" };
    }

    if (profile.toolCalling && !caps.includes("tools.call" as any) && !caps.includes("tools" as any)) {
      return { candidate, eligible: false, rejectionReason: "TOOL_CALLING_NOT_SUPPORTED" };
    }

    if (profile.structuredOutput && !caps.includes("structured_output" as any) && !caps.includes("structuredOutput" as any)) {
      return { candidate, eligible: false, rejectionReason: "STRUCTURED_OUTPUT_NOT_SUPPORTED" };
    }

    if (profile.reasoningMode && !caps.includes("text.reason" as any) && !caps.includes("reasoning" as any)) {
      return { candidate, eligible: false, rejectionReason: "REASONING_NOT_SUPPORTED" };
    }

    if (profile.inputModalities.includes("image") && !caps.includes("vision.input" as any) && !caps.includes("vision.read" as any) && !caps.includes("vision" as any)) {
      return { candidate, eligible: false, rejectionReason: "VISION_INPUT_NOT_SUPPORTED" };
    }

    if (profile.inputModalities.includes("audio") && !caps.includes("audio.input" as any) && !caps.includes("audioInput" as any)) {
      return { candidate, eligible: false, rejectionReason: "AUDIO_INPUT_NOT_SUPPORTED" };
    }

    if (profile.workloadType === "embedding" && !caps.includes("embeddings.create" as any) && !caps.includes("embeddings" as any)) {
      return { candidate, eligible: false, rejectionReason: "EMBEDDING_NOT_SUPPORTED" };
    }

    if (profile.imageGeneration && !caps.includes("images.generate" as any) && !caps.includes("image.generate" as any)) {
      return { candidate, eligible: false, rejectionReason: "IMAGE_GENERATION_NOT_SUPPORTED" };
    }

    if (profile.imageEdit && !caps.includes("images.edit" as any) && !caps.includes("image.edit" as any)) {
      return { candidate, eligible: false, rejectionReason: "IMAGE_EDIT_NOT_SUPPORTED" };
    }

    if (profile.transcription && !caps.includes("audio.transcribe" as any) && !caps.includes("transcription" as any)) {
      return { candidate, eligible: false, rejectionReason: "TRANSCRIPTION_NOT_SUPPORTED" };
    }

    if (profile.speech && !caps.includes("audio.speech" as any) && !caps.includes("speech.synthesize" as any)) {
      return { candidate, eligible: false, rejectionReason: "SPEECH_NOT_SUPPORTED" };
    }

    // 7. Limits Checks (Context Window & Output)
    if (candidate.limits) {
      if (profile.contextTokensEstimated && candidate.limits.contextWindow < profile.contextTokensEstimated) {
        return { candidate, eligible: false, rejectionReason: "CONTEXT_WINDOW_EXCEEDED" };
      }
      if (profile.maxOutputTokens && candidate.limits.maxOutputTokens < profile.maxOutputTokens) {
        return { candidate, eligible: false, rejectionReason: "MAX_OUTPUT_TOKENS_EXCEEDED" };
      }
    }

    // 8. Capacity Check
    if (candidate.capacityState === "exhausted") {
      return { candidate, eligible: false, rejectionReason: "CAPACITY_EXHAUSTED" };
    }

    // 9. Cost Ceiling Check
    const maxCost = options.maxExecutionCostMinor || profile.maxExecutionCostMinor;
    if (maxCost !== undefined && candidate.estimatedCost !== undefined && candidate.estimatedCost > maxCost) {
      return { candidate, eligible: false, rejectionReason: "ESTIMATED_COST_EXCEEDED" };
    }

    return { candidate, eligible: true };
  }
}
