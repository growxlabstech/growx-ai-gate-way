import type { EmbeddingProvider } from "./types.js";

export function cosineSimilarity(
  vecA: readonly number[],
  vecB: readonly number[],
): number {
  if (vecA.length !== vecB.length || vecA.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    const valA = vecA[i] ?? 0;
    const valB = vecB[i] ?? 0;
    dot += valA * valB;
    normA += valA * valA;
    normB += valB * valB;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Deterministic embedding provider that projects text into an n-dimensional unit vector
 * using token/n-gram hashing, suitable for high-throughput testing and offline vector search.
 */
export class DeterministicEmbeddingProvider implements EmbeddingProvider {
  public readonly dimensions: number;
  public readonly modelName: string;

  constructor(options?: { dimensions?: number; modelName?: string }) {
    this.dimensions = options?.dimensions ?? 256;
    this.modelName = options?.modelName ?? "growx-embed-deterministic-v1";
  }

  async embed(text: string): Promise<readonly number[]> {
    return this.generateVector(text);
  }

  async embedBatch(
    texts: readonly string[],
  ): Promise<readonly (readonly number[])[]> {
    return texts.map((t) => this.generateVector(t));
  }

  private generateVector(text: string): readonly number[] {
    const vector = new Float64Array(this.dimensions);
    const normalized = text.toLowerCase().trim();
    const cleanTokens = normalized.replace(/[^\w\s]/g, " ").trim();
    const words = cleanTokens.split(/\s+/).filter(Boolean);

    if (words.length === 0) {
      vector[0] = 1.0;
      return Array.from(vector);
    }

    // 1. Accumulate word and character bi-gram features
    for (let w = 0; w < words.length; w++) {
      const word = words[w] ?? "";
      if (!word) continue;
      const wordHash = this.hashString(word);
      const idx = Math.abs(wordHash) % this.dimensions;
      vector[idx] = (vector[idx] ?? 0) + 1.0;

      // Bi-grams
      for (let i = 0; i < word.length - 1; i++) {
        const bigram = word.slice(i, i + 2);
        const bgHash = this.hashString(bigram);
        const bgIdx = Math.abs(bgHash) % this.dimensions;
        vector[bgIdx] = (vector[bgIdx] ?? 0) + 0.5;
      }
    }

    // 2. Normalize to unit length (L2 norm)
    let sumSq = 0;
    for (let i = 0; i < this.dimensions; i++) {
      const val = vector[i] ?? 0;
      sumSq += val * val;
    }
    const norm = Math.sqrt(sumSq);
    if (norm > 0) {
      for (let i = 0; i < this.dimensions; i++) {
        vector[i] = (vector[i] ?? 0) / norm;
      }
    }

    return Array.from(vector);
  }

  private hashString(str: string): number {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = (hash * 33) ^ str.charCodeAt(i);
    }
    return hash;
  }
}
