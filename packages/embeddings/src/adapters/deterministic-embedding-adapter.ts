import type {
  NormalizedEmbeddingRequest,
  NormalizedEmbeddingResponse,
} from "@growx/contracts";
import type { ProviderEmbeddingAdapter } from "./provider-embedding-adapter.js";
import { formatVectorOutput } from "../encoding.js";

export class DeterministicEmbeddingAdapter implements ProviderEmbeddingAdapter {
  public readonly providerId = "deterministic";

  constructor(private defaultDims: number = 1536) {}

  public translateRequest(request: NormalizedEmbeddingRequest) {
    return {
      urlPath: "/local/embeddings",
      method: "POST" as const,
      body: { inputs: request.inputs },
    };
  }

  public parseResponse(
    rawResponse: unknown,
    request: NormalizedEmbeddingRequest,
    dimensions: number
  ): NormalizedEmbeddingResponse {
    const dims = request.dimensions || dimensions || this.defaultDims;
    const embeddings = request.inputs.map((text: string, idx: number) => ({
      index: idx,
      embedding: this.generateVector(text, dims),
    }));

    const promptTokens = request.inputs.reduce((acc: number, t: string) => acc + Math.max(Math.ceil(t.length / 4), 1), 0);

    return {
      model: request.canonicalModelId,
      embeddings,
      promptTokens,
      totalTokens: promptTokens,
      dimensions: dims,
    };
  }

  public generateVector(text: string, dimensions: number): number[] {
    const vector = new Float64Array(dimensions);
    const normalized = text.toLowerCase().trim();
    const cleanTokens = normalized.replace(/[^\w\s]/g, " ").trim();
    const words = cleanTokens.split(/\s+/).filter(Boolean);

    if (words.length === 0) {
      vector[0] = 1.0;
      return Array.from(vector);
    }

    for (let w = 0; w < words.length; w++) {
      const word = words[w] ?? "";
      if (!word) continue;
      let hash = 5381;
      for (let i = 0; i < word.length; i++) {
        hash = ((hash * 33) ^ word.charCodeAt(i)) >>> 0;
      }
      const idx = Math.abs(hash) % dimensions;
      vector[idx] = (vector[idx] ?? 0) + 1.0;
    }

    // L2 normalize
    let sumSq = 0;
    for (let i = 0; i < dimensions; i++) {
      const val = vector[i] ?? 0;
      sumSq += val * val;
    }
    const norm = Math.sqrt(sumSq);
    if (norm > 0) {
      for (let i = 0; i < dimensions; i++) {
        vector[i] = (vector[i] ?? 0) / norm;
      }
    }

    return Array.from(vector);
  }

  public supportsDimensions(): boolean {
    return true;
  }

  public supportsEncoding(): boolean {
    return true;
  }
}
