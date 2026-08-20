import { generateId } from "@growx/ids";
import {
  DEFAULT_WEBHOOK_RETRY_POLICY,
  WebhookSerializer,
  type OutboundWebhookEvent,
  type WebhookDelivery,
} from "@growx/webhooks";
import type { IWebhookRepository } from "../domain/types.js";

export class WebhookEventRouter {
  constructor(private readonly repository: IWebhookRepository) {}

  /**
   * Routes a domain event to all matching customer webhook endpoints.
   * Performs safe projection, deduplication, and fanout delivery creation.
   */
  async routeEvent<T extends Record<string, unknown>>(params: {
    sourceEventId: string;
    eventType: string; // e.g. "payment.succeeded"
    eventVersion?: string | undefined; // default "v1"
    organizationId: string;
    workspaceId?: string | undefined;
    data: T;
    createdAt?: Date | undefined;
  }): Promise<{ outboundEvent: OutboundWebhookEvent; deliveries: WebhookDelivery[] }> {
    const version = params.eventVersion ?? "v1";
    const fullEventType = `${params.eventType}.${version}`;

    // 1. Idempotency check: has this source event already generated an outbound event?
    const existing = await this.repository.findOutboundEventBySource(
      params.sourceEventId,
      params.eventType,
      version
    );
    if (existing) {
      const existingDeliveries = await this.repository.listDeliveries(params.organizationId);
      const matched = existingDeliveries.filter((d) => d.webhookEventId === existing.id);
      return { outboundEvent: existing, deliveries: matched };
    }

    // 2. Find matching active endpoints for this tenant & event
    const matchingEndpoints = await this.repository.findMatchingEndpoints(
      params.organizationId,
      fullEventType,
      params.workspaceId
    );

    // If no endpoints subscribed, we still record the outbound event or return empty deliveries
    const eventId = generateId("evt");
    const { envelope, payloadHash } = WebhookSerializer.createEnvelope({
      eventId,
      eventType: params.eventType,
      eventVersion: version,
      organizationId: params.organizationId,
      workspaceId: params.workspaceId,
      data: params.data,
      createdAt: params.createdAt,
    });

    const now = new Date();
    const outboundEvent: OutboundWebhookEvent = {
      id: eventId,
      organizationId: params.organizationId,
      workspaceId: params.workspaceId,
      eventType: params.eventType,
      eventVersion: version,
      sourceEventId: params.sourceEventId,
      payload: envelope,
      payloadHash,
      createdAt: now,
    };
    await this.repository.createOutboundEvent(outboundEvent);

    // 3. Fanout deliveries
    const deliveries: WebhookDelivery[] = matchingEndpoints.map((ep) => ({
      id: generateId("del"),
      webhookEventId: outboundEvent.id,
      endpointId: ep.id,
      organizationId: params.organizationId,
      workspaceId: params.workspaceId,
      destinationUrlSnapshot: ep.url,
      signingSecretVersion: ep.secretVersion,
      status: "pending",
      attemptCount: 0,
      maxAttempts: DEFAULT_WEBHOOK_RETRY_POLICY.maxAttempts,
      createdAt: now,
      updatedAt: now,
    }));

    if (deliveries.length > 0) {
      await this.repository.createDeliveries(deliveries);
    }

    return { outboundEvent, deliveries };
  }
}
