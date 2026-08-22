/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from "vitest";
import {
  capacityState,
  ConnectionBalancer,
  type ProviderConnectionCapacity,
} from "../src/capacity.js";
const value = (id: string, current: number): ProviderConnectionCapacity => ({
  id,
  providerId: "p",
  status: "healthy",
  maximumConcurrency: 10,
  currentConcurrency: current,
  requestsPerMinute: 0,
  requestLimitPerMinute: 100,
  tokensPerMinute: 0,
  tokenLimitPerMinute: 1000,
  safetyMargin: 0.8,
  weight: 1,
  p95LatencyMs: current,
});
describe("provider capacity", () => {
  it("uses a safety margin and least-request balancing", () => {
    expect(capacityState(value("full", 8))).toBe("exhausted");
    expect(
      new ConnectionBalancer().select(
        [value("busy", 5), value("free", 1)],
        "least_requests",
      ).id,
    ).toBe("free");
  });
});
