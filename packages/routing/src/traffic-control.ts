import crypto from "node:crypto";
import type { RouteTrafficControl } from "@growx/contracts";
import type { RouteCandidate } from "./types.js";

export class TrafficControlEvaluator {
  /**
   * Applies route traffic controls (drain, disable, canary traffic percent).
   */
  public static applyControls(
    candidates: RouteCandidate[],
    controls: Map<string, RouteTrafficControl>,
    requestPartitionKey: string = "",
  ): RouteCandidate[] {
    const result: RouteCandidate[] = [];

    for (const cand of candidates) {
      const ctrl = controls.get(cand.routeId);
      if (!ctrl) {
        result.push(cand);
        continue;
      }

      // 1. Kill switch / disabled
      if (ctrl.disabled || ctrl.mode === "disabled") {
        continue;
      }

      // 2. Draining mode: excluded from primary ordinary routing
      if (ctrl.drain || ctrl.mode === "draining") {
        continue;
      }

      // 3. Canary traffic split
      if (ctrl.mode === "canary" && ctrl.maxTrafficPercent < 100) {
        const hash = crypto
          .createHash("md5")
          .update(
            cand.routeId +
              ":" +
              (requestPartitionKey || Math.random().toString()),
          )
          .digest("hex");
        const hashInt = parseInt(hash.substring(0, 4), 16) % 100;

        if (hashInt >= ctrl.maxTrafficPercent) {
          continue;
        }
      }

      result.push(cand);
    }

    return result;
  }
}
