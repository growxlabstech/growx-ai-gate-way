import { generateId } from "@growx/ids";
import {
  DEFAULT_WEBHOOK_RETRY_POLICY,
  type WebhookDelivery,
  type WebhookReplayJob,
} from "@growx/webhooks";
import type { IWebhookRepository } from "../domain/types.js";

export class WebhookReplayService {
  constructor(private readonly repository: IWebhookRepository) {}

  /**
   * Replays a single specific delivery (e.g. from dead_letter or failed).
   * Preserves identical event ID, creates a new delivery record with reset attempt counter.
   */
  async replayDelivery(
    organizationId: string,
    deliveryId: string
  ): Promise<WebhookDelivery> {
    const original = await this.repository.getDelivery(organizationId, deliveryId);
    if (!original) {
      throw new Error(`Webhook delivery not found: ${deliveryId}`);
    }

    const endpoint = await this.repository.getEndpoint(organizationId, original.endpointId);
    const now = new Date();

    const newDelivery: WebhookDelivery = {
      id: generateId("del"),
      webhookEventId: original.webhookEventId, // Same stable external event ID
      endpointId: original.endpointId,
      organizationId,
      workspaceId: original.workspaceId,
      destinationUrlSnapshot: endpoint?.url ?? original.destinationUrlSnapshot,
      signingSecretVersion: endpoint?.secretVersion ?? original.signingSecretVersion,
      status: "pending",
      attemptCount: 0,
      maxAttempts: DEFAULT_WEBHOOK_RETRY_POLICY.maxAttempts,
      createdAt: now,
      updatedAt: now,
    };

    await this.repository.createDeliveries([newDelivery]);
    return newDelivery;
  }

  /**
   * Replays an entire event to one or all matching active endpoints.
   */
  async replayEvent(
    organizationId: string,
    eventId: string,
    endpointId?: string | undefined
  ): Promise<WebhookDelivery[]> {
    const event = await this.repository.getOutboundEvent(organizationId, eventId);
    if (!event) {
      throw new Error(`Outbound webhook event not found: ${eventId}`);
    }

    let targetEndpoints = [];
    if (endpointId) {
      const ep = await this.repository.getEndpoint(organizationId, endpointId);
      if (!ep) throw new Error(`Webhook endpoint not found: ${endpointId}`);
      targetEndpoints = [ep];
    } else {
      targetEndpoints = await this.repository.findMatchingEndpoints(
        organizationId,
        `${event.eventType}.${event.eventVersion}`,
        event.workspaceId
      );
    }

    const now = new Date();
    const newDeliveries: WebhookDelivery[] = targetEndpoints.map((ep) => ({
      id: generateId("del"),
      webhookEventId: event.id,
      endpointId: ep.id,
      organizationId,
      workspaceId: event.workspaceId,
      destinationUrlSnapshot: ep.url,
      signingSecretVersion: ep.secretVersion,
      status: "pending",
      attemptCount: 0,
      maxAttempts: DEFAULT_WEBHOOK_RETRY_POLICY.maxAttempts,
      createdAt: now,
      updatedAt: now,
    }));

    if (newDeliveries.length > 0) {
      await this.repository.createDeliveries(newDeliveries);
    }

    return newDeliveries;
  }

  /**
   * Executes a bounded bulk replay job over historical events.
   */
  async createBulkReplayJob(params: {
    organizationId: string;
    filterConfig: {
      eventTypes?: string[] | undefined;
      fromDate?: Date | undefined;
      toDate?: Date | undefined;
      endpointId?: string | undefined;
    };
  }): Promise<{ job: WebhookReplayJob; createdDeliveriesCount: number }> {
    const events = await this.repository.listOutboundEvents(params.organizationId, {
      fromDate: params.filterConfig.fromDate,
      toDate: params.filterConfig.toDate,
    });

    const filteredEvents = events.filter((e) =>
      params.filterConfig.eventTypes && params.filterConfig.eventTypes.length > 0
        ? params.filterConfig.eventTypes.includes(e.eventType) ||
          params.filterConfig.eventTypes.includes(`${e.eventType}.${e.eventVersion}`)
        : true
    );

    const now = new Date();
    const jobId = generateId("rpljob");
    const job: WebhookReplayJob = {
      id: jobId,
      organizationId: params.organizationId,
      filterConfig: params.filterConfig,
      status: "processing",
      totalEvents: filteredEvents.length,
      replayedEvents: 0,
      createdAt: now,
    };
    await this.repository.createReplayJob(job);

    let totalDeliveries = 0;
    for (const evt of filteredEvents) {
      const deliveries = await this.replayEvent(
        params.organizationId,
        evt.id,
        params.filterConfig.endpointId
      );
      totalDeliveries += deliveries.length;
    }

    const completed = await this.repository.updateReplayJob(jobId, {
      status: "completed",
      replayedEvents: filteredEvents.length,
      completedAt: new Date(),
    });

    return { job: completed, createdDeliveriesCount: totalDeliveries };
  }
}
