import type { WebhookDeliveryService } from "@growx/webhook-service";

export const workerName = "webhook-worker";

export interface WebhookWorkerOptions {
  deliveryService: WebhookDeliveryService;
  pollIntervalMs?: number | undefined;
  batchSize?: number | undefined;
  leaseDurationMs?: number | undefined;
  workerId?: string | undefined;
}

export class WebhookWorker {
  private isRunning = false;
  private timer?: NodeJS.Timeout | undefined;

  constructor(private readonly options: WebhookWorkerOptions) {}

  async runOnce(): Promise<{
    delivered: number;
    retried: number;
    deadLettered: number;
  }> {
    return this.options.deliveryService.processBatch({
      batchSize: this.options.batchSize ?? 10,
      leaseDurationMs: this.options.leaseDurationMs ?? 30_000,
      workerId: this.options.workerId,
    });
  }

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    const interval = this.options.pollIntervalMs ?? 1000;
    const loop = async () => {
      if (!this.isRunning) return;
      try {
        await this.runOnce();
      } catch {
        // Log & swallow worker iteration errors
      }
      if (this.isRunning) {
        this.timer = setTimeout(loop, interval);
      }
    };

    void loop();
  }

  stop(): void {
    this.isRunning = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }
}
