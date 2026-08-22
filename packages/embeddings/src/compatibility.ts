import { EmbeddingVectorSpaceIncompatibleError } from "./types.js";

export interface RouteVectorIdentity {
  canonicalModelId: string;
  providerModelId: string;
  compatibilityGroup?: string | undefined;
}

export class EmbeddingCompatibilityManager {
  /**
   * Checks if two routes share the exact same vector space.
   * Fallback is ONLY allowed if:
   * 1. They serve the exact same canonicalModelId, OR
   * 2. They belong to an explicitly verified identical compatibilityGroup.
   */
  public static isCompatible(
    primary: RouteVectorIdentity,
    candidate: RouteVectorIdentity,
  ): boolean {
    if (primary.canonicalModelId === candidate.canonicalModelId) {
      return true;
    }

    if (
      primary.compatibilityGroup &&
      candidate.compatibilityGroup &&
      primary.compatibilityGroup === candidate.compatibilityGroup
    ) {
      return true;
    }

    return false;
  }

  public static assertCompatible(
    primary: RouteVectorIdentity,
    candidate: RouteVectorIdentity,
  ): void {
    if (!this.isCompatible(primary, candidate)) {
      throw new EmbeddingVectorSpaceIncompatibleError(
        `Cannot fallback between incompatible vector spaces: Primary (${primary.canonicalModelId}) vs Candidate (${candidate.canonicalModelId})`,
      );
    }
  }
}
