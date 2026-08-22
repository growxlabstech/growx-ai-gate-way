import type {
  OutboundWebhookEvent,
  WebhookDelivery,
  WebhookDeliveryAttempt,
  WebhookDeliveryStatus,
  WebhookEndpoint,
  WebhookReplayJob,
  WebhookSigningSecret,
  WebhookSubscription,
} from "@growx/webhooks";

export interface IWebhookRepository {
  // Endpoints
  createEndpoint(endpoint: WebhookEndpoint): Promise<WebhookEndpoint>;
  getEndpoint(
    organizationId: string,
    id: string,
  ): Promise<WebhookEndpoint | undefined>;
  listEndpoints(
    organizationId: string,
    workspaceId?: string | undefined,
  ): Promise<WebhookEndpoint[]>;
  updateEndpoint(
    organizationId: string,
    id: string,
    updates: Partial<WebhookEndpoint>,
  ): Promise<WebhookEndpoint>;

  // Secrets
  createSigningSecret(
    secret: WebhookSigningSecret,
  ): Promise<WebhookSigningSecret>;
  getActiveSigningSecret(
    endpointId: string,
  ): Promise<WebhookSigningSecret | undefined>;
  listSigningSecrets(endpointId: string): Promise<WebhookSigningSecret[]>;
  updateSigningSecret(
    id: string,
    updates: Partial<WebhookSigningSecret>,
  ): Promise<WebhookSigningSecret>;

  // Subscriptions
  createSubscriptions(
    endpointId: string,
    eventTypes: readonly string[],
  ): Promise<WebhookSubscription[]>;
  listSubscriptions(endpointId: string): Promise<WebhookSubscription[]>;
  findMatchingEndpoints(
    organizationId: string,
    eventType: string,
    workspaceId?: string | undefined,
  ): Promise<WebhookEndpoint[]>;

  // Outbound Events
  createOutboundEvent(
    event: OutboundWebhookEvent,
  ): Promise<OutboundWebhookEvent>;
  getOutboundEvent(
    organizationId: string,
    id: string,
  ): Promise<OutboundWebhookEvent | undefined>;
  findOutboundEventBySource(
    sourceEventId: string,
    eventType: string,
    eventVersion: string,
  ): Promise<OutboundWebhookEvent | undefined>;
  listOutboundEvents(
    organizationId: string,
    filters?: {
      eventType?: string | undefined;
      fromDate?: Date | undefined;
      toDate?: Date | undefined;
    },
  ): Promise<OutboundWebhookEvent[]>;

  // Deliveries & Attempts
  createDeliveries(deliveries: WebhookDelivery[]): Promise<WebhookDelivery[]>;
  getDelivery(
    organizationId: string,
    id: string,
  ): Promise<WebhookDelivery | undefined>;
  listDeliveries(
    organizationId: string,
    filters?: {
      endpointId?: string | undefined;
      status?: WebhookDeliveryStatus | undefined;
    },
  ): Promise<WebhookDelivery[]>;
  updateDelivery(
    id: string,
    updates: Partial<WebhookDelivery>,
  ): Promise<WebhookDelivery>;
  claimPendingDeliveries(
    batchSize: number,
    leaseDurationMs: number,
    workerId: string,
  ): Promise<WebhookDelivery[]>;
  createAttempt(
    attempt: WebhookDeliveryAttempt,
  ): Promise<WebhookDeliveryAttempt>;
  listAttempts(deliveryId: string): Promise<WebhookDeliveryAttempt[]>;

  // Replay Jobs
  createReplayJob(job: WebhookReplayJob): Promise<WebhookReplayJob>;
  getReplayJob(
    organizationId: string,
    id: string,
  ): Promise<WebhookReplayJob | undefined>;
  updateReplayJob(
    id: string,
    updates: Partial<WebhookReplayJob>,
  ): Promise<WebhookReplayJob>;
}
