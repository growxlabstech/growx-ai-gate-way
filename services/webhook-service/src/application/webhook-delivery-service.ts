import { generateId } from "@growx/ids";
import {
  calculateNextAttemptMs,
  classifyDeliveryOutcome,
  decryptWebhookSecret,
  DEFAULT_WEBHOOK_RETRY_POLICY,
  parseRetryAfterHeader,
  resolveAndValidateDns,
  signWebhook,
  validateWebhookUrl,
  WEBHOOK_HEADERS,
  type WebhookDelivery,
  type WebhookDeliveryAttempt,
  type WebhookRetryPolicy,
} from "@growx/webhooks";
import type { IWebhookRepository } from "../domain/types.js";
import type { WebhookEndpointService } from "./webhook-endpoint-service.js";

export interface WebhookDeliveryServiceOptions {
  repository: IWebhookRepository;
  endpointService: WebhookEndpointService;
  retryPolicy?: WebhookRetryPolicy | undefined;
  fetcher?: typeof fetch | undefined;
}

export class WebhookDeliveryService {
  private readonly repository: IWebhookRepository;
  private readonly endpointService: WebhookEndpointService;
  private readonly retryPolicy: WebhookRetryPolicy;
  private readonly fetcher: typeof fetch;

  constructor(options: WebhookDeliveryServiceOptions) {
    this.repository = options.repository;
    this.endpointService = options.endpointService;
    this.retryPolicy = options.retryPolicy ?? DEFAULT_WEBHOOK_RETRY_POLICY;
    this.fetcher = options.fetcher ?? fetch;
  }

  /**
   * Claims and processes a batch of pending deliveries.
   */
  async processBatch(
    params: {
      batchSize?: number | undefined;
      leaseDurationMs?: number | undefined;
      workerId?: string | undefined;
      allowInsecureHttp?: boolean | undefined;
    } = {},
  ): Promise<{ delivered: number; retried: number; deadLettered: number }> {
    const batchSize = params.batchSize ?? 10;
    const leaseDurationMs = params.leaseDurationMs ?? 30_000;
    const workerId = params.workerId ?? generateId("wrk");

    const claimed = await this.repository.claimPendingDeliveries(
      batchSize,
      leaseDurationMs,
      workerId,
    );

    let delivered = 0;
    let retried = 0;
    let deadLettered = 0;

    for (const d of claimed) {
      const outcome = await this.deliverSingle(d, {
        allowInsecureHttp: params.allowInsecureHttp,
      });
      if (outcome.status === "succeeded") delivered++;
      else if (outcome.status === "retrying") retried++;
      else if (outcome.status === "dead_letter") deadLettered++;
    }

    return { delivered, retried, deadLettered };
  }

  /**
   * Executes delivery attempt for a single delivery job.
   */
  async deliverSingle(
    delivery: WebhookDelivery,
    options?: { allowInsecureHttp?: boolean | undefined },
  ): Promise<{ status: string; responseStatus?: number | undefined }> {
    const now = new Date();
    const startedAt = now;
    const attemptNumber = delivery.attemptCount + 1;

    // 1. Fetch Outbound Event
    const event = await this.repository.getOutboundEvent(
      delivery.organizationId,
      delivery.webhookEventId,
    );
    if (!event) {
      // Event missing -> mark dead letter
      await this.repository.updateDelivery(delivery.id, {
        status: "dead_letter",
        lastErrorCategory: "UNKNOWN",
        leaseExpiresAt: undefined,
      });
      return { status: "dead_letter" };
    }

    // 2. Fetch Endpoint and Active Secret
    const endpoint = await this.repository.getEndpoint(
      delivery.organizationId,
      delivery.endpointId,
    );
    if (!endpoint || endpoint.status === "disabled") {
      // Endpoint disabled -> mark cancelled or dead_letter
      await this.repository.updateDelivery(delivery.id, {
        status: "cancelled",
        leaseExpiresAt: undefined,
      });
      return { status: "cancelled" };
    }

    const secretRecord = await this.repository.getActiveSigningSecret(
      endpoint.id,
    );
    const plaintextSecret = secretRecord
      ? decryptWebhookSecret(secretRecord.encryptedSecret)
      : decryptWebhookSecret(endpoint.secretEncrypted);

    // 3. SSRF & Pre-flight Destination Check
    let responseStatus: number | undefined;
    let responseBodySnippet: string | undefined;
    let error: Error | undefined;
    let retryAfterSeconds: number | undefined;

    try {
      const destinationUrl = validateWebhookUrl(
        delivery.destinationUrlSnapshot,
        {
          allowInsecureHttp: options?.allowInsecureHttp,
        },
      );
      await resolveAndValidateDns(destinationUrl.hostname);

      // 4. Exact Body String & Signing
      const rawBody = JSON.stringify(event.payload);
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = signWebhook({
        id: event.id,
        timestamp,
        body: rawBody,
        secret: plaintextSecret,
      });

      // 5. Send HTTP Request
      const response = await this.fetcher(destinationUrl.toString(), {
        method: "POST",
        redirect: "manual",
        signal: AbortSignal.timeout(10_000), // 10s strict timeout
        headers: {
          "content-type": "application/json",
          "user-agent": "GrowX-Webhooks/1.0",
          [WEBHOOK_HEADERS.id]: event.id,
          [WEBHOOK_HEADERS.eventType]: `${event.eventType}.${event.eventVersion}`,
          [WEBHOOK_HEADERS.deliveryId]: delivery.id,
          [WEBHOOK_HEADERS.timestamp]: String(timestamp),
          [WEBHOOK_HEADERS.signature]: signature,
        },
        body: rawBody,
      });

      responseStatus = response.status;
      retryAfterSeconds = parseRetryAfterHeader(
        response.headers.get("retry-after"),
      );

      // Read small bounded snippet of response body
      try {
        const text = await response.text();
        responseBodySnippet = text.slice(0, 500);
      } catch {
        responseBodySnippet = undefined;
      }
    } catch (err: any) {
      error = err;
    }

    const completedAt = new Date();
    const latencyMs = completedAt.getTime() - startedAt.getTime();

    // 6. Classify Outcome
    const outcome = classifyDeliveryOutcome({
      responseStatus,
      error,
      currentAttempt: attemptNumber,
      maxAttempts: delivery.maxAttempts,
    });

    // 7. Record Attempt
    const attempt: WebhookDeliveryAttempt = {
      id: generateId("att"),
      deliveryId: delivery.id,
      attemptNumber,
      startedAt,
      completedAt,
      responseStatus,
      latencyMs,
      errorCategory: outcome.errorCategory,
      responseBodySnippet,
    };
    await this.repository.createAttempt(attempt);

    // 8. Update Delivery Status & Schedule
    if (outcome.status === "succeeded") {
      await this.repository.updateDelivery(delivery.id, {
        status: "succeeded",
        attemptCount: attemptNumber,
        lastResponseCode: responseStatus,
        lastErrorCategory: undefined,
        deliveredAt: completedAt,
        leaseExpiresAt: undefined,
      });
      await this.endpointService.recordEndpointOutcome(
        delivery.organizationId,
        endpoint.id,
        true,
      );
    } else if (outcome.status === "retrying") {
      const delayMs = calculateNextAttemptMs(
        attemptNumber,
        this.retryPolicy,
        retryAfterSeconds,
      );
      const nextAttemptAt = new Date(completedAt.getTime() + delayMs);

      await this.repository.updateDelivery(delivery.id, {
        status: "retrying",
        attemptCount: attemptNumber,
        nextAttemptAt,
        lastResponseCode: responseStatus,
        lastErrorCategory: outcome.errorCategory,
        leaseExpiresAt: undefined,
      });
      await this.endpointService.recordEndpointOutcome(
        delivery.organizationId,
        endpoint.id,
        false,
      );
    } else {
      // Dead Letter or permanent failure
      await this.repository.updateDelivery(delivery.id, {
        status: "dead_letter",
        attemptCount: attemptNumber,
        lastResponseCode: responseStatus,
        lastErrorCategory: outcome.errorCategory,
        leaseExpiresAt: undefined,
      });
      await this.endpointService.recordEndpointOutcome(
        delivery.organizationId,
        endpoint.id,
        false,
      );
    }

    return { status: outcome.status, responseStatus };
  }
}
