import type { AvailabilitySignal, LatencySignal } from "./types.js";

export interface ILatencySignalProvider {
  getLatencySignal(
    providerId: string,
    providerModelId: string,
    region?: string | undefined
  ): Promise<LatencySignal | null>;
}

export interface IAvailabilitySignalProvider {
  getAvailabilitySignal(
    providerId: string,
    providerModelId?: string | undefined
  ): Promise<AvailabilitySignal | null>;
}

export interface ICapacitySignalProvider {
  getCapacitySignal(
    providerId: string,
    providerModelId?: string | undefined
  ): Promise<{
    utilization: number;
    state: "available" | "busy" | "near_limit" | "exhausted";
  } | null>;
}
