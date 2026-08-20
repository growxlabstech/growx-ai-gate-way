import type {
  EscalationService,
  NotificationDeliveryService,
} from "@growx/notification-service";

export const workerName = "notification-worker";

export interface NotificationWorkerOptions {
  deliveryService: NotificationDeliveryService;
  escalationService?: EscalationService | undefined;
  pollIntervalMs?: number | undefined;
  batchSize?: number | undefined;
  leaseDurationMs?: number | undefined;
  workerId?: string | undefined;
}

export class NotificationWorker {
  private isRunning = false;
  private timer?: NodeJS.Timeout | undefined;

  constructor(private readonly options: NotificationWorkerOptions) {}

  async runOnce(): Promise<{ delivered: number; retried: number; failed: number }> {
    const deliveryResult = await this.options.deliveryService.processBatch({
      batchSize: this.options.batchSize ?? 10,
      leaseDurationMs: this.options.leaseDurationMs ?? 30_000,
      workerId: this.options.workerId,
    });

    if (this.options.escalationService) {
      await this.options.escalationService.processDueEscalations();
    }

    return deliveryResult;
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
        // Swallow worker iteration errors in background
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
