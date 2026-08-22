export type CanonicalModelStatus =
  "active" | "deprecated" | "disabled" | "draft" | "retired";
export type ModelCategory =
  | "chat"
  | "responses"
  | "embeddings"
  | "image"
  | "audio"
  | "transcription"
  | "rerank";
export type InputModality = "text" | "image" | "audio" | "video" | "file";
export type OutputModality =
  "text" | "image" | "audio" | "embeddings" | "video";

export type CanonicalCapability =
  | "text.generate"
  | "text.reason"
  | "tools.call"
  | "structured_output"
  | "vision.input"
  | "video.input"
  | "file.input"
  | "image.generate"
  | "audio.input"
  | "audio.output"
  | "speech.generate"
  | "transcription"
  | "embeddings.create"
  | "streaming"
  | "batch";

export interface ConsoleModelItem {
  id: string;
  canonicalId: string;
  displayName: string;
  family: string;
  category: ModelCategory;
  status: CanonicalModelStatus;
  description: string;
  contextWindow: number;
  contextWindowFormatted: string;
  maxOutputTokens: number;
  maxOutputTokensFormatted: string;
  supportsStreaming: boolean;
  supportsTools: boolean;
  supportsStructuredOutput: boolean;
  supportsReasoning: boolean;
  inputModalities: InputModality[];
  outputModalities: OutputModality[];
  capabilities: CanonicalCapability[];
  pricingSummary?: string;
  deprecatedAt?: string | null;
  sunsetAt?: string | null;
  replacementModelId?: string | null;
  deprecationMessage?: string | null;
  isAvailableInWorkspace: boolean;
  unavailableReason?: string | null;
}

export interface ModelFilterOptions {
  search?: string;
  category?: string; // all, chat, embeddings, etc.
  capability?: string; // all, streaming, tools, vision, reasoning, structured_output
  availabilityOnly?: boolean;
}

export const CANONICAL_GROWX_MODELS: ConsoleModelItem[] = [
  {
    id: "growx/fast",
    canonicalId: "growx/fast",
    displayName: "GrowX Fast Intelligent Router",
    family: "GrowX",
    category: "chat",
    status: "active",
    description:
      "Low-latency intelligent router dynamically selecting optimal downstream execution targets based on cost, latency, and reliability telemetry.",
    contextWindow: 128000,
    contextWindowFormatted: "128K",
    maxOutputTokens: 16384,
    maxOutputTokensFormatted: "16K",
    supportsStreaming: true,
    supportsTools: true,
    supportsStructuredOutput: true,
    supportsReasoning: true,
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    capabilities: [
      "text.generate",
      "text.reason",
      "tools.call",
      "structured_output",
      "vision.input",
      "streaming",
    ],
    pricingSummary: "$0.40 / 1M in · $1.60 / 1M out",
    isAvailableInWorkspace: true,
  },
  {
    id: "openai/gpt-4o",
    canonicalId: "openai/gpt-4o",
    displayName: "OpenAI GPT-4o Flagship",
    family: "OpenAI",
    category: "chat",
    status: "active",
    description:
      "High-intelligence flagship model for multimodal reasoning, complex code generation, and function calling across text and visual inputs.",
    contextWindow: 128000,
    contextWindowFormatted: "128K",
    maxOutputTokens: 16384,
    maxOutputTokensFormatted: "16K",
    supportsStreaming: true,
    supportsTools: true,
    supportsStructuredOutput: true,
    supportsReasoning: false,
    inputModalities: ["text", "image", "audio"],
    outputModalities: ["text", "audio"],
    capabilities: [
      "text.generate",
      "tools.call",
      "structured_output",
      "vision.input",
      "audio.input",
      "audio.output",
      "streaming",
    ],
    pricingSummary: "$2.50 / 1M in · $10.00 / 1M out",
    isAvailableInWorkspace: true,
  },
  {
    id: "openai/gpt-4o-mini",
    canonicalId: "openai/gpt-4o-mini",
    displayName: "OpenAI GPT-4o Mini",
    family: "OpenAI",
    category: "chat",
    status: "active",
    description:
      "Fast, cost-effective multimodal model for lightweight inference, bulk processing, and high-frequency production tasks.",
    contextWindow: 128000,
    contextWindowFormatted: "128K",
    maxOutputTokens: 16384,
    maxOutputTokensFormatted: "16K",
    supportsStreaming: true,
    supportsTools: true,
    supportsStructuredOutput: true,
    supportsReasoning: false,
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    capabilities: [
      "text.generate",
      "tools.call",
      "structured_output",
      "vision.input",
      "streaming",
    ],
    pricingSummary: "$0.15 / 1M in · $0.60 / 1M out",
    isAvailableInWorkspace: true,
  },
  {
    id: "anthropic/claude-3-5-sonnet",
    canonicalId: "anthropic/claude-3-5-sonnet",
    displayName: "Claude 3.5 Sonnet",
    family: "Anthropic",
    category: "chat",
    status: "active",
    description:
      "State-of-the-art model for complex coding, agentic workflows, nuanced technical reasoning, and artifact synthesis.",
    contextWindow: 200000,
    contextWindowFormatted: "200K",
    maxOutputTokens: 8192,
    maxOutputTokensFormatted: "8K",
    supportsStreaming: true,
    supportsTools: true,
    supportsStructuredOutput: true,
    supportsReasoning: true,
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    capabilities: [
      "text.generate",
      "text.reason",
      "tools.call",
      "structured_output",
      "vision.input",
      "streaming",
    ],
    pricingSummary: "$3.00 / 1M in · $15.00 / 1M out",
    isAvailableInWorkspace: true,
  },
  {
    id: "google/gemini-1.5-pro",
    canonicalId: "google/gemini-1.5-pro",
    displayName: "Gemini 1.5 Pro",
    family: "Google",
    category: "chat",
    status: "active",
    description:
      "Massive context window multimodal model supporting long-document synthesis, audio/video analysis, and high-throughput reasoning.",
    contextWindow: 2000000,
    contextWindowFormatted: "2M",
    maxOutputTokens: 8192,
    maxOutputTokensFormatted: "8K",
    supportsStreaming: true,
    supportsTools: true,
    supportsStructuredOutput: true,
    supportsReasoning: true,
    inputModalities: ["text", "image", "audio", "video"],
    outputModalities: ["text"],
    capabilities: [
      "text.generate",
      "text.reason",
      "tools.call",
      "structured_output",
      "vision.input",
      "audio.input",
      "video.input",
      "streaming",
    ],
    pricingSummary: "$1.25 / 1M in · $5.00 / 1M out",
    isAvailableInWorkspace: true,
  },
  {
    id: "text-embedding-3-small",
    canonicalId: "text-embedding-3-small",
    displayName: "OpenAI Text Embedding 3 Small",
    family: "OpenAI",
    category: "embeddings",
    status: "active",
    description:
      "High-efficiency vector embedding model for semantic search, retrieval augmented generation (RAG), and classification.",
    contextWindow: 8191,
    contextWindowFormatted: "8K",
    maxOutputTokens: 1536,
    maxOutputTokensFormatted: "1.5K dim",
    supportsStreaming: false,
    supportsTools: false,
    supportsStructuredOutput: false,
    supportsReasoning: false,
    inputModalities: ["text"],
    outputModalities: ["embeddings"],
    capabilities: ["embeddings.create"],
    pricingSummary: "$0.02 / 1M in",
    isAvailableInWorkspace: true,
  },
  {
    id: "text-embedding-3-large",
    canonicalId: "text-embedding-3-large",
    displayName: "OpenAI Text Embedding 3 Large",
    family: "OpenAI",
    category: "embeddings",
    status: "active",
    description:
      "High-dimension vector embedding model with 3,072 dimensions for precision enterprise search and multi-lingual retrieval.",
    contextWindow: 8191,
    contextWindowFormatted: "8K",
    maxOutputTokens: 3072,
    maxOutputTokensFormatted: "3K dim",
    supportsStreaming: false,
    supportsTools: false,
    supportsStructuredOutput: false,
    supportsReasoning: false,
    inputModalities: ["text"],
    outputModalities: ["embeddings"],
    capabilities: ["embeddings.create"],
    pricingSummary: "$0.13 / 1M in",
    isAvailableInWorkspace: true,
  },
  {
    id: "openai/gpt-3.5-turbo",
    canonicalId: "openai/gpt-3.5-turbo",
    displayName: "GPT-3.5 Turbo (Deprecated)",
    family: "OpenAI",
    category: "chat",
    status: "deprecated",
    description:
      "Legacy generation model. Replaced by openai/gpt-4o-mini for superior performance and reduced latency.",
    contextWindow: 16385,
    contextWindowFormatted: "16K",
    maxOutputTokens: 4096,
    maxOutputTokensFormatted: "4K",
    supportsStreaming: true,
    supportsTools: true,
    supportsStructuredOutput: false,
    supportsReasoning: false,
    inputModalities: ["text"],
    outputModalities: ["text"],
    capabilities: ["text.generate", "tools.call", "streaming"],
    pricingSummary: "$0.50 / 1M in · $1.50 / 1M out",
    deprecatedAt: "2026-01-01T00:00:00Z",
    sunsetAt: "2026-12-31T23:59:59Z",
    replacementModelId: "openai/gpt-4o-mini",
    deprecationMessage:
      "Please migrate to openai/gpt-4o-mini for lower latency and improved reasoning.",
    isAvailableInWorkspace: true,
  },
  {
    id: "enterprise/custom-finetuned",
    canonicalId: "enterprise/custom-finetuned",
    displayName: "Enterprise Fine-Tuned Model",
    family: "Enterprise",
    category: "chat",
    status: "disabled",
    description:
      "Custom fine-tuned weights model restricted to Enterprise plan workspaces with dedicated hosting agreements.",
    contextWindow: 32000,
    contextWindowFormatted: "32K",
    maxOutputTokens: 4096,
    maxOutputTokensFormatted: "4K",
    supportsStreaming: true,
    supportsTools: false,
    supportsStructuredOutput: false,
    supportsReasoning: false,
    inputModalities: ["text"],
    outputModalities: ["text"],
    capabilities: ["text.generate", "streaming"],
    pricingSummary: "Enterprise Custom Tier",
    isAvailableInWorkspace: false,
    unavailableReason:
      "Requires Enterprise plan entitlement and dedicated cluster provisioning.",
  },
];

async function getCookiesHeader(): Promise<string> {
  try {
    const { cookies } = await import("next/headers");
    return (await cookies()).toString();
  } catch {
    return "";
  }
}

export async function loadWorkspaceModels(params: {
  organizationId: string;
  workspaceId: string;
  filters?: ModelFilterOptions;
}): Promise<ConsoleModelItem[]> {
  const cookieHeader = await getCookiesHeader();
  let models: ConsoleModelItem[] = [...CANONICAL_GROWX_MODELS];

  if (
    !process.env.D2_FIXTURE_IDENTITY &&
    !cookieHeader.includes("gx_fixture=")
  ) {
    const identityServiceUrl =
      process.env.IDENTITY_SERVICE_URL ?? "http://127.0.0.1:4000";
    try {
      const response = await fetch(`${identityServiceUrl}/v1/models`, {
        method: "GET",
        cache: "no-store",
        headers: { cookie: cookieHeader },
        signal: AbortSignal.timeout(2000),
      });
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data.data) && data.data.length > 0) {
          models = data.data.map((m: any) => ({
            id: m.id ?? m.canonicalId,
            canonicalId: m.canonicalId ?? m.id,
            displayName: m.displayName ?? m.id,
            family: m.family ?? "OpenAI",
            category: m.category ?? "chat",
            status: m.status ?? "active",
            description: m.description ?? "",
            contextWindow: m.contextWindow ?? 128000,
            contextWindowFormatted: `${Math.round((m.contextWindow ?? 128000) / 1000)}K`,
            maxOutputTokens: m.maxOutputTokens ?? 4096,
            maxOutputTokensFormatted: `${Math.round((m.maxOutputTokens ?? 4096) / 1000)}K`,
            supportsStreaming: Boolean(m.supportsStreaming),
            supportsTools: Boolean(m.supportsTools),
            supportsStructuredOutput: Boolean(m.supportsStructuredOutput),
            supportsReasoning: Boolean(m.supportsReasoning),
            inputModalities: m.inputModalities ?? ["text"],
            outputModalities: m.outputModalities ?? ["text"],
            capabilities: m.capabilities ?? ["text.generate", "streaming"],
            pricingSummary: m.pricingSummary ?? "$1.00 / 1M",
            isAvailableInWorkspace: m.status !== "disabled",
            deprecatedAt: m.deprecatedAt,
            sunsetAt: m.sunsetAt,
            replacementModelId: m.replacementModelId,
            deprecationMessage: m.deprecationMessage,
          }));
        }
      }
    } catch {
      // Fall back to canonical catalog
    }
  }

  // Workspace-specific policy adjustment if needed (e.g. Orbit Systems has only standard models)
  if (params.workspaceId === "ws_orbit") {
    models = models.filter((m) => m.family !== "Enterprise");
  }

  // Apply filters
  if (params.filters) {
    const { search, category, capability, availabilityOnly } = params.filters;
    if (search && search.trim()) {
      const term = search.toLowerCase().trim();
      models = models.filter(
        (m) =>
          m.id.toLowerCase().includes(term) ||
          m.displayName.toLowerCase().includes(term) ||
          m.family.toLowerCase().includes(term) ||
          m.description.toLowerCase().includes(term),
      );
    }
    if (category && category !== "all") {
      models = models.filter((m) => m.category === category);
    }
    if (capability && capability !== "all") {
      if (capability === "tools")
        models = models.filter((m) => m.supportsTools);
      else if (capability === "structured_output")
        models = models.filter((m) => m.supportsStructuredOutput);
      else if (capability === "reasoning")
        models = models.filter((m) => m.supportsReasoning);
      else if (capability === "vision")
        models = models.filter((m) => m.inputModalities.includes("image"));
      else if (capability === "embeddings")
        models = models.filter((m) => m.category === "embeddings");
      else if (capability === "streaming")
        models = models.filter((m) => m.supportsStreaming);
    }
    if (availabilityOnly) {
      models = models.filter(
        (m) => m.isAvailableInWorkspace && m.status === "active",
      );
    }
  }

  return models;
}

export async function loadWorkspaceModel(params: {
  organizationId: string;
  workspaceId: string;
  modelId: string;
}): Promise<ConsoleModelItem | null> {
  const models = await loadWorkspaceModels({
    organizationId: params.organizationId,
    workspaceId: params.workspaceId,
  });
  const decoded = decodeURIComponent(params.modelId);
  return (
    models.find((m) => m.id === decoded || m.canonicalId === decoded) ?? null
  );
}
