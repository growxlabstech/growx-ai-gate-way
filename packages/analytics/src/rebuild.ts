import type { AnalyticsRepository } from "./repository.js";
import { AnalyticsProjectionEngine } from "./projector.js";

export class AnalyticsRebuildService {
  constructor(private readonly repository: AnalyticsRepository) {}

  public async rebuildFromAuthoritativeLedger(): Promise<{
    processedRequests: number;
    processedAttempts: number;
    processedEvents: number;
  }> {
    // 1. Clear existing projected rollups
    await this.repository.clearAllRollups();

    // 2. Re-read all authoritative records
    const requests = await this.repository.getAllRequestRecords();
    const attempts = await this.repository.getAllAttemptRecords();
    const events = await this.repository.getAllUsageEvents();

    const engine = new AnalyticsProjectionEngine(this.repository);

    // 3. Re-project each request with its attempts and events
    for (const req of requests) {
      const reqAttempts = attempts.filter((a) => a.requestId === req.requestId);
      const reqEvents = events.filter((e) => e.requestId === req.requestId);
      await engine.projectRequest(req, reqAttempts, reqEvents);
    }

    return {
      processedRequests: requests.length,
      processedAttempts: attempts.length,
      processedEvents: events.length,
    };
  }
}
