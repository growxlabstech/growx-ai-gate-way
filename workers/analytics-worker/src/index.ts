import {
  AnalyticsProjectionEngine,
  AnalyticsRepository,
  AnalyticsCheckpointRecord,
} from "@growx/analytics";
import { createPublicId } from "@growx/ids";

export const workerName = "analytics-worker";

export interface AnalyticsWorkerOptions {
  repository: AnalyticsRepository;
  pollIntervalMs?: number;
  batchSize?: number;
}

export class AnalyticsProjectionWorker {
  private isRunning = false;
  private timer: NodeJS.Timeout | null = null;
  private readonly pollIntervalMs: number;
  private readonly batchSize: number;
  private readonly projectionEngine: AnalyticsProjectionEngine;

  constructor(private readonly options: AnalyticsWorkerOptions) {
    this.pollIntervalMs = options.pollIntervalMs ?? 5000;
    this.batchSize = options.batchSize ?? 100;
    this.projectionEngine = new AnalyticsProjectionEngine(options.repository);
  }

  public async runOnce(): Promise<{ processedCount: number }> {
    const checkpoint = (await this.options.repository.getCheckpoint("analytics_main_projector")) ?? {
      id: createPublicId("anlchk"),
      projectorName: "analytics_main_projector",
      lastProcessedEventId: null,
      lastProcessedTimestamp: null,
      processedEventsCount: 0n,
      updatedAt: new Date(),
    };

    const requests = await this.options.repository.getAllRequestRecords();
    const attempts = await this.options.repository.getAllAttemptRecords();
    const events = await this.options.repository.getAllUsageEvents();

    let processedCount = 0;
    for (const req of requests) {
      if (checkpoint.lastProcessedTimestamp && req.createdAt <= checkpoint.lastProcessedTimestamp) {
        continue;
      }
      const reqAttempts = attempts.filter((a) => a.requestId === req.requestId);
      const reqEvents = events.filter((e) => e.requestId === req.requestId);
      await this.projectionEngine.projectRequest(req, reqAttempts, reqEvents);
      processedCount++;
    }

    if (processedCount > 0) {
      const lastReq = requests[requests.length - 1];
      await this.options.repository.saveCheckpoint({
        ...checkpoint,
        lastProcessedEventId: lastReq ? lastReq.id : null,
        lastProcessedTimestamp: lastReq ? lastReq.createdAt : new Date(),
        processedEventsCount: checkpoint.processedEventsCount + BigInt(processedCount),
        updatedAt: new Date(),
      });
    }

    return { processedCount };
  }

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    const loop = async () => {
      if (!this.isRunning) return;
      try {
        await this.runOnce();
      } catch (err) {
        console.error("AnalyticsProjectionWorker error:", err);
      }
      if (this.isRunning) {
        this.timer = setTimeout(loop, this.pollIntervalMs);
      }
    };
    void loop();
  }

  public stop(): void {
    this.isRunning = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}

export async function run(): Promise<void> {
  return Promise.resolve();
}

if (process.env.NODE_ENV !== "test") void run();
