import type { RouteCandidate } from "../types.js";
import type { RequestCapabilityProfile } from "@growx/contracts";

export class LocalityScorer {
  /**
   * Computes region proximity and affinity score (0 - 100).
   */
  public static score(
    candidate: RouteCandidate,
    profile: RequestCapabilityProfile,
  ): { score: number; matchedRegion: boolean } {
    const pref = profile.regionRequirement?.toLowerCase();
    const candReg = (candidate.region || "global").toLowerCase();

    if (!pref || pref === "global" || candReg === "global") {
      return { score: 80, matchedRegion: false };
    }

    if (candReg.includes(pref) || pref.includes(candReg)) {
      return { score: 100, matchedRegion: true };
    }

    return { score: 60, matchedRegion: false };
  }
}
