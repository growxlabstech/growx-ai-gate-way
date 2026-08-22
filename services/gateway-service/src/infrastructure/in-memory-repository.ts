import type { IGatewayRepository } from "../application/repository.js";
import type {
  GatewayAttemptEntity,
  GatewayErrorRecord,
  GatewayLatencyRecord,
  GatewayRequestEntity,
  GatewayUsageSnapshot,
} from "../domain/types.js";

export class InMemoryGatewayRepository implements IGatewayRepository {
  public requests = new Map<string, GatewayRequestEntity>();
  public attempts = new Map<string, GatewayAttemptEntity>();
  public usages = new Map<string, GatewayUsageSnapshot>();
  public latencies = new Map<string, GatewayLatencyRecord>();
  public errors = new Map<string, GatewayErrorRecord>();

  async createRequest(request: GatewayRequestEntity): Promise<void> {
    this.requests.set(request.id, { ...request });
  }

  async updateRequest(
    id: string,
    updates: Partial<GatewayRequestEntity>,
  ): Promise<void> {
    const existing = this.requests.get(id);
    if (existing) {
      this.requests.set(id, { ...existing, ...updates });
    }
  }

  async getRequest(id: string): Promise<GatewayRequestEntity | null> {
    const record = this.requests.get(id);
    return record ? { ...record } : null;
  }

  async saveUsageSnapshot(usage: GatewayUsageSnapshot): Promise<void> {
    this.usages.set(usage.id, { ...usage });
  }

  async saveLatencyRecord(latency: GatewayLatencyRecord): Promise<void> {
    this.latencies.set(latency.requestId, { ...latency });
  }

  async saveErrorRecord(error: GatewayErrorRecord): Promise<void> {
    this.errors.set(error.id, { ...error });
  }

  async createAttempt(attempt: GatewayAttemptEntity): Promise<void> {
    this.attempts.set(attempt.id, { ...attempt });
  }

  async updateAttempt(
    id: string,
    updates: Partial<GatewayAttemptEntity>,
  ): Promise<void> {
    const existing = this.attempts.get(id);
    if (existing) {
      this.attempts.set(id, { ...existing, ...updates });
    }
  }

  async listAttemptsByRequestId(
    requestId: string,
  ): Promise<GatewayAttemptEntity[]> {
    return Array.from(this.attempts.values())
      .filter((a) => a.requestId === requestId)
      .sort((a, b) => a.attemptNumber - b.attemptNumber)
      .map((a) => ({ ...a }));
  }

  async getAttempt(id: string): Promise<GatewayAttemptEntity | null> {
    const a = this.attempts.get(id);
    return a ? { ...a } : null;
  }

  clear(): void {
    this.requests.clear();
    this.attempts.clear();
    this.usages.clear();
    this.latencies.clear();
    this.errors.clear();
  }
}
