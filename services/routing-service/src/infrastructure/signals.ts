import type {
  IAvailabilitySignalProvider,
  ILatencySignalProvider,
} from "../domain/signals.js";
import type { AvailabilitySignal, LatencySignal } from "../domain/types.js";

export class InMemoryLatencySignalStore implements ILatencySignalProvider {
  private signals = new Map<string, LatencySignal>();
  private samples = new Map<string, number[]>();
  private readonly maxSamples: number;

  constructor(maxSamples = 100) {
    this.maxSamples = maxSamples;
  }

  private getKey(providerId: string, providerModelId: string, region?: string): string {
    return `${providerId}:${providerModelId}:${region ?? "global"}`;
  }

  recordLatency(
    providerId: string,
    providerModelId: string,
    latencyMs: number,
    region?: string
  ): void {
    const key = this.getKey(providerId, providerModelId, region);
    const existing = this.samples.get(key) || [];
    existing.push(latencyMs);
    if (existing.length > this.maxSamples) {
      existing.shift();
    }
    this.samples.set(key, existing);

    // Compute p95 and p50
    const sorted = [...existing].sort((a, b) => a - b);
    const p50Idx = Math.floor(sorted.length * 0.5);
    const p95Idx = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));

    this.signals.set(key, {
      providerId,
      providerModelId,
      region,
      p50LatencyMs: sorted[p50Idx] ?? latencyMs,
      p95LatencyMs: sorted[p95Idx] ?? latencyMs,
      source: "telemetry",
      sampledAt: new Date(),
    });
  }

  setSignal(signal: LatencySignal): void {
    const key = this.getKey(signal.providerId, signal.providerModelId, signal.region);
    this.signals.set(key, { ...signal });
  }

  async getLatencySignal(
    providerId: string,
    providerModelId: string,
    region?: string | undefined
  ): Promise<LatencySignal | null> {
    const key = this.getKey(providerId, providerModelId, region);
    const sig = this.signals.get(key);
    if (sig) return { ...sig };

    // Fallback without region
    const fallbackKey = this.getKey(providerId, providerModelId);
    const fallbackSig = this.signals.get(fallbackKey);
    if (fallbackSig) return { ...fallbackSig };

    return null;
  }

  clear(): void {
    this.signals.clear();
    this.samples.clear();
  }
}

export class InMemoryAvailabilitySignalStore implements IAvailabilitySignalProvider {
  private signals = new Map<string, AvailabilitySignal>();

  private getKey(providerId: string, providerModelId?: string): string {
    return `${providerId}:${providerModelId ?? "*"}`;
  }

  setSignal(signal: AvailabilitySignal): void {
    const key = this.getKey(signal.providerId, signal.providerModelId);
    this.signals.set(key, { ...signal });
  }

  async getAvailabilitySignal(
    providerId: string,
    providerModelId?: string | undefined
  ): Promise<AvailabilitySignal | null> {
    const key = this.getKey(providerId, providerModelId);
    const sig = this.signals.get(key);
    if (sig) return { ...sig };

    const providerKey = this.getKey(providerId);
    const providerSig = this.signals.get(providerKey);
    if (providerSig) return { ...providerSig };

    return null;
  }

  clear(): void {
    this.signals.clear();
  }
}
