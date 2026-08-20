/**
 * Mergeable Latency Distribution Sketch.
 * Stores counts across standardized logarithmic latency buckets to enable
 * mathematically exact merges across time windows (e.g. 24 1-hour sketches -> 1 daily sketch)
 * without ever averaging percentiles.
 */

export const LATENCY_BUCKET_UPPER_BOUNDS = [
  5, 10, 20, 35, 50, 75, 100, 150, 200, 300, 500, 750, 1000, 1500, 2000, 3000, 5000, 7500, 10000, 15000, 20000, 30000, 60000, 120000
] as const;

export interface LatencySketchData {
  count: number;
  sumMs: number;
  minMs: number;
  maxMs: number;
  buckets: Record<number, number>;
}

export class LatencyDistributionSketch {
  public count: number = 0;
  public sumMs: number = 0;
  public minMs: number = 0;
  public maxMs: number = 0;
  public readonly buckets: Map<number, number> = new Map();

  constructor(data?: LatencySketchData) {
    for (const bound of LATENCY_BUCKET_UPPER_BOUNDS) {
      this.buckets.set(bound, 0);
    }
    // Overflow bucket (> 120000ms)
    this.buckets.set(Infinity, 0);

    if (data) {
      this.count = data.count;
      this.sumMs = data.sumMs;
      this.minMs = data.minMs;
      this.maxMs = data.maxMs;
      for (const [k, v] of Object.entries(data.buckets)) {
        const key = k === "Infinity" || k === "null" ? Infinity : Number(k);
        this.buckets.set(key, (this.buckets.get(key) ?? 0) + v);
      }
    }
  }

  public record(latencyMs: number): void {
    if (latencyMs < 0) return;
    const roundedMs = Math.round(latencyMs);

    if (this.count === 0) {
      this.minMs = roundedMs;
      this.maxMs = roundedMs;
    } else {
      if (roundedMs < this.minMs) this.minMs = roundedMs;
      if (roundedMs > this.maxMs) this.maxMs = roundedMs;
    }

    this.count++;
    this.sumMs += roundedMs;

    for (const bound of LATENCY_BUCKET_UPPER_BOUNDS) {
      if (roundedMs <= bound) {
        this.buckets.set(bound, (this.buckets.get(bound) ?? 0) + 1);
        return;
      }
    }

    this.buckets.set(Infinity, (this.buckets.get(Infinity) ?? 0) + 1);
  }

  public merge(other: LatencyDistributionSketch | LatencySketchData): this {
    const otherSketch = other instanceof LatencyDistributionSketch ? other : new LatencyDistributionSketch(other);
    if (otherSketch.count === 0) return this;

    if (this.count === 0) {
      this.count = otherSketch.count;
      this.sumMs = otherSketch.sumMs;
      this.minMs = otherSketch.minMs;
      this.maxMs = otherSketch.maxMs;
    } else {
      this.count += otherSketch.count;
      this.sumMs += otherSketch.sumMs;
      if (otherSketch.minMs < this.minMs) this.minMs = otherSketch.minMs;
      if (otherSketch.maxMs > this.maxMs) this.maxMs = otherSketch.maxMs;
    }

    for (const [bound, count] of otherSketch.buckets.entries()) {
      this.buckets.set(bound, (this.buckets.get(bound) ?? 0) + count);
    }

    return this;
  }

  public percentile(p: number): number {
    if (this.count === 0) return 0;
    if (p <= 0) return this.minMs;
    if (p >= 100) return this.maxMs;

    const rank = Math.ceil((p / 100) * this.count);
    let cumulative = 0;
    let prevBound = 0;

    for (const bound of LATENCY_BUCKET_UPPER_BOUNDS) {
      const bucketCount = this.buckets.get(bound) ?? 0;
      cumulative += bucketCount;

      if (cumulative >= rank) {
        // Linear interpolation within bucket
        const countInBucket = bucketCount;
        const rankInBucket = rank - (cumulative - bucketCount);
        if (countInBucket === 0) return bound;
        const fraction = rankInBucket / countInBucket;
        const estimate = prevBound + fraction * (bound - prevBound);
        return Math.min(this.maxMs, Math.max(this.minMs, Math.round(estimate)));
      }
      prevBound = bound;
    }

    return this.maxMs;
  }

  public mean(): number {
    if (this.count === 0) return 0;
    return Math.round((this.sumMs / this.count) * 100) / 100;
  }

  public toJSON(): LatencySketchData {
    const bucketsObj: Record<number, number> = {};
    for (const [bound, count] of this.buckets.entries()) {
      if (count > 0) {
        bucketsObj[bound] = count;
      }
    }
    return {
      count: this.count,
      sumMs: this.sumMs,
      minMs: this.minMs,
      maxMs: this.maxMs,
      buckets: bucketsObj,
    };
  }

  public static fromJSON(data: LatencySketchData): LatencyDistributionSketch {
    return new LatencyDistributionSketch(data);
  }
}
