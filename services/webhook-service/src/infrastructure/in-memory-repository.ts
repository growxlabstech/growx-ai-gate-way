import { matchesEventSubscription } from "@growx/webhooks";
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
import type { IWebhookRepository } from "../domain/types.js";

export class InMemoryWebhookRepository implements IWebhookRepository {
  public readonly endpoints = new Map<string, WebhookEndpoint>();
  public readonly secrets = new Map<string, WebhookSigningSecret>();
  public readonly subscriptions = new Map<string, WebhookSubscription>();
  public readonly outboundEvents = new Map<string, OutboundWebhookEvent>();
  public readonly deliveries = new Map<string, WebhookDelivery>();
  public readonly attempts = new Map<string, WebhookDeliveryAttempt>();
  public readonly replayJobs = new Map<string, WebhookReplayJob>();

  // ─── Endpoints ───────────────────────────────────────────────

  async createEndpoint(endpoint: WebhookEndpoint): Promise<WebhookEndpoint> {
    this.endpoints.set(endpoint.id, endpoint);
    return endpoint;
  }

  async getEndpoint(
    organizationId: string,
    id: string
  ): Promise<WebhookEndpoint | undefined> {
    const endpoint = this.endpoints.get(id);
    if (!endpoint || endpoint.organizationId !== organizationId) return undefined;
    return endpoint;
  }

  async listEndpoints(
    organizationId: string,
    workspaceId?: string | undefined
  ): Promise<WebhookEndpoint[]> {
    return Array.from(this.endpoints.values())
      .filter((e) => e.organizationId === organizationId)
      .filter((e) => (workspaceId ? !e.workspaceId || e.workspaceId === workspaceId : true));
  }

  async updateEndpoint(
    organizationId: string,
    id: string,
    updates: Partial<WebhookEndpoint>
  ): Promise<WebhookEndpoint> {
    const existing = await this.getEndpoint(organizationId, id);
    if (!existing) throw new Error(`Webhook endpoint not found: ${id}`);

    const updated = { ...existing, ...updates, updatedAt: new Date() };
    this.endpoints.set(id, updated);
    return updated;
  }

  // ─── Secrets ─────────────────────────────────────────────────

  async createSigningSecret(secret: WebhookSigningSecret): Promise<WebhookSigningSecret> {
    this.secrets.set(secret.id, secret);
    return secret;
  }

  async getActiveSigningSecret(endpointId: string): Promise<WebhookSigningSecret | undefined> {
    return Array.from(this.secrets.values()).find(
      (s) => s.endpointId === endpointId && s.status === "active"
    );
  }

  async listSigningSecrets(endpointId: string): Promise<WebhookSigningSecret[]> {
    return Array.from(this.secrets.values()).filter((s) => s.endpointId === endpointId);
  }

  async updateSigningSecret(
    id: string,
    updates: Partial<WebhookSigningSecret>
  ): Promise<WebhookSigningSecret> {
    const existing = this.secrets.get(id);
    if (!existing) throw new Error(`Signing secret not found: ${id}`);
    const updated = { ...existing, ...updates };
    this.secrets.set(id, updated);
    return updated;
  }

  // ─── Subscriptions ───────────────────────────────────────────

  async createSubscriptions(
    endpointId: string,
    eventTypes: readonly string[]
  ): Promise<WebhookSubscription[]> {
    const results: WebhookSubscription[] = [];
    const now = new Date();

    for (const type of eventTypes) {
      const sub: WebhookSubscription = {
        id: `sub_${endpointId}_${type}`,
        endpointId,
        eventType: type,
        createdAt: now,
      };
      this.subscriptions.set(sub.id, sub);
      results.push(sub);
    }

    return results;
  }

  async listSubscriptions(endpointId: string): Promise<WebhookSubscription[]> {
    return Array.from(this.subscriptions.values()).filter(
      (s) => s.endpointId === endpointId
    );
  }

  async findMatchingEndpoints(
    organizationId: string,
    eventType: string,
    workspaceId?: string | undefined
  ): Promise<WebhookEndpoint[]> {
    const orgEndpoints = Array.from(this.endpoints.values()).filter(
      (e) => e.organizationId === organizationId && e.status === "active"
    );

    const matching: WebhookEndpoint[] = [];

    for (const ep of orgEndpoints) {
      // If endpoint is workspace-scoped, event must match workspace
      if (ep.workspaceId && workspaceId && ep.workspaceId !== workspaceId) {
        continue;
      }

      // Check if endpoint eventTypes match pattern
      const hasMatch = ep.eventTypes.some((subscribed) =>
        matchesEventSubscription(subscribed, eventType)
      );

      if (hasMatch) {
        matching.push(ep);
      }
    }

    return matching;
  }

  // ─── Outbound Events ─────────────────────────────────────────

  async createOutboundEvent(event: OutboundWebhookEvent): Promise<OutboundWebhookEvent> {
    this.outboundEvents.set(event.id, event);
    return event;
  }

  async getOutboundEvent(
    organizationId: string,
    id: string
  ): Promise<OutboundWebhookEvent | undefined> {
    const evt = this.outboundEvents.get(id);
    if (!evt || evt.organizationId !== organizationId) return undefined;
    return evt;
  }

  async findOutboundEventBySource(
    sourceEventId: string,
    eventType: string,
    eventVersion: string
  ): Promise<OutboundWebhookEvent | undefined> {
    return Array.from(this.outboundEvents.values()).find(
      (e) =>
        e.sourceEventId === sourceEventId &&
        e.eventType === eventType &&
        e.eventVersion === eventVersion
    );
  }

  async listOutboundEvents(
    organizationId: string,
    filters?: {
      eventType?: string | undefined;
      fromDate?: Date | undefined;
      toDate?: Date | undefined;
    }
  ): Promise<OutboundWebhookEvent[]> {
    return Array.from(this.outboundEvents.values())
      .filter((e) => e.organizationId === organizationId)
      .filter((e) => (filters?.eventType ? e.eventType === filters.eventType : true))
      .filter((e) => (filters?.fromDate ? e.createdAt >= filters.fromDate : true))
      .filter((e) => (filters?.toDate ? e.createdAt <= filters.toDate : true));
  }

  // ─── Deliveries & Attempts ───────────────────────────────────

  async createDeliveries(deliveries: WebhookDelivery[]): Promise<WebhookDelivery[]> {
    for (const d of deliveries) {
      this.deliveries.set(d.id, d);
    }
    return deliveries;
  }

  async getDelivery(
    organizationId: string,
    id: string
  ): Promise<WebhookDelivery | undefined> {
    const del = this.deliveries.get(id);
    if (!del || del.organizationId !== organizationId) return undefined;
    return del;
  }

  async listDeliveries(
    organizationId: string,
    filters?: {
      endpointId?: string | undefined;
      status?: WebhookDeliveryStatus | undefined;
    }
  ): Promise<WebhookDelivery[]> {
    return Array.from(this.deliveries.values())
      .filter((d) => d.organizationId === organizationId)
      .filter((d) => (filters?.endpointId ? d.endpointId === filters.endpointId : true))
      .filter((d) => (filters?.status ? d.status === filters.status : true));
  }

  async updateDelivery(
    id: string,
    updates: Partial<WebhookDelivery>
  ): Promise<WebhookDelivery> {
    const existing = this.deliveries.get(id);
    if (!existing) throw new Error(`Webhook delivery not found: ${id}`);
    const updated = { ...existing, ...updates, updatedAt: new Date() };
    this.deliveries.set(id, updated);
    return updated;
  }

  async claimPendingDeliveries(
    batchSize: number,
    leaseDurationMs: number,
    workerId: string
  ): Promise<WebhookDelivery[]> {
    const now = new Date();
    const claimed: WebhookDelivery[] = [];

    for (const d of this.deliveries.values()) {
      if (claimed.length >= batchSize) break;

      const isLeaseExpired = !d.leaseExpiresAt || d.leaseExpiresAt <= now;
      const isStatusEligible =
        d.status === "pending" ||
        d.status === "retrying" ||
        (d.status === "delivering" && isLeaseExpired);
      const isTimeEligible = !d.nextAttemptAt || d.nextAttemptAt <= now;

      if (isStatusEligible && isTimeEligible && isLeaseExpired) {
        const leaseExpiresAt = new Date(now.getTime() + leaseDurationMs);
        const updated: WebhookDelivery = {
          ...d,
          status: "delivering",
          leaseExpiresAt,
          claimedBy: workerId,
          updatedAt: now,
        };
        this.deliveries.set(d.id, updated);
        claimed.push(updated);
      }
    }

    return claimed;
  }

  async createAttempt(attempt: WebhookDeliveryAttempt): Promise<WebhookDeliveryAttempt> {
    this.attempts.set(attempt.id, attempt);
    return attempt;
  }

  async listAttempts(deliveryId: string): Promise<WebhookDeliveryAttempt[]> {
    return Array.from(this.attempts.values()).filter((a) => a.deliveryId === deliveryId);
  }

  // ─── Replay Jobs ─────────────────────────────────────────────

  async createReplayJob(job: WebhookReplayJob): Promise<WebhookReplayJob> {
    this.replayJobs.set(job.id, job);
    return job;
  }

  async getReplayJob(
    organizationId: string,
    id: string
  ): Promise<WebhookReplayJob | undefined> {
    const job = this.replayJobs.get(id);
    if (!job || job.organizationId !== organizationId) return undefined;
    return job;
  }

  async updateReplayJob(
    id: string,
    updates: Partial<WebhookReplayJob>
  ): Promise<WebhookReplayJob> {
    const existing = this.replayJobs.get(id);
    if (!existing) throw new Error(`Replay job not found: ${id}`);
    const updated = { ...existing, ...updates };
    this.replayJobs.set(id, updated);
    return updated;
  }
}
