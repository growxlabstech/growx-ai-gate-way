import crypto from "node:crypto";
import {
  type RequestCapabilityProfile,
  type RoutingLatencyClass,
  type RoutingWorkloadType,
} from "@growx/contracts";

export function buildRequestCapabilityProfile(options: {
  canonicalModelId: string;
  workloadType?: RoutingWorkloadType | undefined;
  latencyClass?: RoutingLatencyClass | undefined;
  streaming?: boolean | undefined;
  inputModalities?: string[] | undefined;
  outputModalities?: string[] | undefined;
  toolCalling?: boolean | undefined;
  structuredOutput?: boolean | undefined;
  reasoningMode?: boolean | undefined;
  contextTokensEstimated?: number | undefined;
  maxOutputTokens?: number | undefined;
  batch?: boolean | undefined;
  regionRequirement?: string | undefined;
  dataResidencyRequirement?: string | undefined;
  providerPreference?: string | undefined;
  requiredProvider?: string | undefined;
  maxExecutionCostMinor?: number | undefined;
  imageGeneration?: boolean | undefined;
  imageEdit?: boolean | undefined;
  transcription?: boolean | undefined;
  speech?: boolean | undefined;
  audioInput?: boolean | undefined;
  mediaCount?: number | undefined;
  estimatedMediaBytes?: number | undefined;
  audioDuration?: number | undefined;
  requestedImageSize?: string | undefined;
  requestedImageQuality?: string | undefined;
  requestedVoice?: string | undefined;
  requestedAudioFormat?: string | undefined;
}): RequestCapabilityProfile {
  const workloadType =
    options.workloadType ||
    classifyWorkload({
      batch: options.batch,
      streaming: options.streaming,
      toolCalling: options.toolCalling,
      structuredOutput: options.structuredOutput,
      reasoningMode: options.reasoningMode,
      inputModalities: options.inputModalities,
    });

  const latencyClass =
    options.latencyClass ||
    (options.batch ? "throughput" : options.streaming ? "interactive" : "standard");

  return {
    canonicalModelId: options.canonicalModelId,
    workloadType,
    latencyClass,
    streaming: options.streaming ?? false,
    inputModalities: (options.inputModalities || ["text"]) as any,
    outputModalities: (options.outputModalities || ["text"]) as any,
    toolCalling: options.toolCalling ?? false,
    structuredOutput: options.structuredOutput ?? false,
    reasoningMode: options.reasoningMode ?? false,
    contextTokensEstimated: options.contextTokensEstimated,
    maxOutputTokens: options.maxOutputTokens,
    batch: options.batch ?? false,
    regionRequirement: options.regionRequirement,
    dataResidencyRequirement: options.dataResidencyRequirement,
    providerPreference: options.providerPreference,
    requiredProvider: options.requiredProvider,
    maxExecutionCostMinor: options.maxExecutionCostMinor,
    imageGeneration: options.imageGeneration ?? false,
    imageEdit: options.imageEdit ?? false,
    transcription: options.transcription ?? false,
    speech: options.speech ?? false,
    audioInput: options.audioInput ?? false,
    mediaCount: options.mediaCount,
    estimatedMediaBytes: options.estimatedMediaBytes,
    audioDuration: options.audioDuration,
    requestedImageSize: options.requestedImageSize,
    requestedImageQuality: options.requestedImageQuality,
    requestedVoice: options.requestedVoice,
    requestedAudioFormat: options.requestedAudioFormat,
  };
}

export function classifyWorkload(options: {
  batch?: boolean | undefined;
  streaming?: boolean | undefined;
  toolCalling?: boolean | undefined;
  structuredOutput?: boolean | undefined;
  reasoningMode?: boolean | undefined;
  inputModalities?: string[] | undefined;
}): RoutingWorkloadType {
  if (options.batch) return "batch";
  if (options.reasoningMode) return "reasoning";
  if (options.toolCalling) return "tool_call";
  if (options.structuredOutput) return "structured_generation";
  if (options.inputModalities?.includes("image")) return "image";
  if (options.inputModalities?.includes("audio")) return "audio";
  if (options.inputModalities?.includes("file") || options.inputModalities?.includes("document")) return "document";
  if (options.streaming === false) return "realtime_background";
  return "realtime_interactive";
}

export function hashRequestCapabilityProfile(profile: RequestCapabilityProfile): string {
  const canonicalData = {
    canonicalModelId: profile.canonicalModelId,
    workloadType: profile.workloadType,
    latencyClass: profile.latencyClass,
    streaming: profile.streaming,
    inputModalities: [...profile.inputModalities].sort(),
    outputModalities: [...profile.outputModalities].sort(),
    toolCalling: profile.toolCalling,
    structuredOutput: profile.structuredOutput,
    reasoningMode: profile.reasoningMode,
    contextTokensEstimated: profile.contextTokensEstimated ?? 0,
    maxOutputTokens: profile.maxOutputTokens ?? 0,
    batch: profile.batch,
    regionRequirement: profile.regionRequirement ?? "",
    dataResidencyRequirement: profile.dataResidencyRequirement ?? "",
    providerPreference: profile.providerPreference ?? "",
    requiredProvider: profile.requiredProvider ?? "",
    maxExecutionCostMinor: profile.maxExecutionCostMinor ?? 0,
  };

  return crypto
    .createHash("sha256")
    .update(JSON.stringify(canonicalData))
    .digest("hex");
}
