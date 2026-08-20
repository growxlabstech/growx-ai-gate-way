import { outbox, securityEvents } from "@growx/database";
import { createPublicId } from "@growx/ids";
import type {
  GatewayAttemptEvent,
  GatewayRequestCancelledEvent,
  GatewayRequestCompletedEvent,
  GatewayRequestFailedEvent,
  GatewayRequestStartedEvent,
  IGatewayEvents,
} from "../application/events.js";

export class InMemoryGatewayEvents implements IGatewayEvents {
  public startedEvents: GatewayRequestStartedEvent[] = [];
  public completedEvents: GatewayRequestCompletedEvent[] = [];
  public failedEvents: GatewayRequestFailedEvent[] = [];
  public cancelledEvents: GatewayRequestCancelledEvent[] = [];
  public attemptStartedEvents: GatewayAttemptEvent[] = [];
  public attemptSucceededEvents: GatewayAttemptEvent[] = [];
  public attemptFailedEvents: GatewayAttemptEvent[] = [];
  public fallbackSelectedEvents: Array<{
    requestId: string;
    fromProviderId: string;
    toProviderId: string;
    fromRouteId?: string | undefined;
    toRouteId?: string | undefined;
    reason: string;
    organizationId?: string | undefined;
    workspaceId?: string | undefined;
  }> = [];
  public retryScheduledEvents: Array<{
    requestId: string;
    attemptNumber: number;
    delayMs: number;
    reason: string;
    organizationId?: string | undefined;
    workspaceId?: string | undefined;
  }> = [];
  public retryExhaustedEvents: Array<{
    requestId: string;
    totalAttempts: number;
    lastError: string;
    organizationId?: string | undefined;
    workspaceId?: string | undefined;
  }> = [];
  public securityEvents: Array<{
    type: string;
    data: Record<string, unknown>;
    requestId?: string | undefined;
  }> = [];

  async emitRequestStarted(event: GatewayRequestStartedEvent): Promise<void> {
    this.startedEvents.push({ ...event });
  }

  async emitRequestCompleted(event: GatewayRequestCompletedEvent): Promise<void> {
    this.completedEvents.push({ ...event });
  }

  async emitRequestFailed(event: GatewayRequestFailedEvent): Promise<void> {
    this.failedEvents.push({ ...event });
  }

  async emitRequestCancelled(event: GatewayRequestCancelledEvent): Promise<void> {
    this.cancelledEvents.push({ ...event });
  }

  async emitAttemptStarted(event: GatewayAttemptEvent): Promise<void> {
    this.attemptStartedEvents.push({ ...event });
  }

  async emitAttemptSucceeded(event: GatewayAttemptEvent): Promise<void> {
    this.attemptSucceededEvents.push({ ...event });
  }

  async emitAttemptFailed(event: GatewayAttemptEvent): Promise<void> {
    this.attemptFailedEvents.push({ ...event });
  }

  async emitFallbackSelected(event: {
    requestId: string;
    fromProviderId: string;
    toProviderId: string;
    fromRouteId?: string | undefined;
    toRouteId?: string | undefined;
    reason: string;
    organizationId?: string | undefined;
    workspaceId?: string | undefined;
  }): Promise<void> {
    this.fallbackSelectedEvents.push({ ...event });
  }

  async emitRetryScheduled(event: {
    requestId: string;
    attemptNumber: number;
    delayMs: number;
    reason: string;
    organizationId?: string | undefined;
    workspaceId?: string | undefined;
  }): Promise<void> {
    this.retryScheduledEvents.push({ ...event });
  }

  async emitRetryExhausted(event: {
    requestId: string;
    totalAttempts: number;
    lastError: string;
    organizationId?: string | undefined;
    workspaceId?: string | undefined;
  }): Promise<void> {
    this.retryExhaustedEvents.push({ ...event });
  }

  async emitSecurityEvent(
    type: string,
    data: Record<string, unknown>,
    requestId?: string | undefined
  ): Promise<void> {
    this.securityEvents.push({ type, data, requestId });
  }

  clear(): void {
    this.startedEvents = [];
    this.completedEvents = [];
    this.failedEvents = [];
    this.cancelledEvents = [];
    this.attemptStartedEvents = [];
    this.attemptSucceededEvents = [];
    this.attemptFailedEvents = [];
    this.fallbackSelectedEvents = [];
    this.retryScheduledEvents = [];
    this.retryExhaustedEvents = [];
    this.securityEvents = [];
  }
}

export class DrizzleGatewayEvents implements IGatewayEvents {
  constructor(private readonly db: any) {}

  async emitRequestStarted(event: GatewayRequestStartedEvent): Promise<void> {
    await this.emitOutboxEvent(
      "gateway.request.started",
      event as unknown as Record<string, unknown>,
      event.requestId,
      event.organizationId,
      event.workspaceId
    );
  }

  async emitRequestCompleted(event: GatewayRequestCompletedEvent): Promise<void> {
    await this.emitOutboxEvent(
      "gateway.request.completed",
      event as unknown as Record<string, unknown>,
      event.requestId,
      event.organizationId,
      event.workspaceId
    );
  }

  async emitRequestFailed(event: GatewayRequestFailedEvent): Promise<void> {
    await this.emitOutboxEvent(
      "gateway.request.failed",
      event as unknown as Record<string, unknown>,
      event.requestId,
      event.organizationId,
      event.workspaceId
    );
  }

  async emitRequestCancelled(event: GatewayRequestCancelledEvent): Promise<void> {
    await this.emitOutboxEvent(
      "gateway.request.cancelled",
      event as unknown as Record<string, unknown>,
      event.requestId,
      event.organizationId,
      event.workspaceId
    );
  }

  async emitAttemptStarted(event: GatewayAttemptEvent): Promise<void> {
    await this.emitOutboxEvent(
      "gateway.attempt.started",
      event as unknown as Record<string, unknown>,
      event.requestId,
      event.organizationId,
      event.workspaceId
    );
  }

  async emitAttemptSucceeded(event: GatewayAttemptEvent): Promise<void> {
    await this.emitOutboxEvent(
      "gateway.attempt.succeeded",
      event as unknown as Record<string, unknown>,
      event.requestId,
      event.organizationId,
      event.workspaceId
    );
  }

  async emitAttemptFailed(event: GatewayAttemptEvent): Promise<void> {
    await this.emitOutboxEvent(
      "gateway.attempt.failed",
      event as unknown as Record<string, unknown>,
      event.requestId,
      event.organizationId,
      event.workspaceId
    );
  }

  async emitFallbackSelected(event: {
    requestId: string;
    fromProviderId: string;
    toProviderId: string;
    fromRouteId?: string | undefined;
    toRouteId?: string | undefined;
    reason: string;
    organizationId?: string | undefined;
    workspaceId?: string | undefined;
  }): Promise<void> {
    await this.emitOutboxEvent(
      "gateway.fallback.selected",
      event,
      event.requestId,
      event.organizationId,
      event.workspaceId
    );
  }

  async emitRetryScheduled(event: {
    requestId: string;
    attemptNumber: number;
    delayMs: number;
    reason: string;
    organizationId?: string | undefined;
    workspaceId?: string | undefined;
  }): Promise<void> {
    await this.emitOutboxEvent(
      "gateway.retry.scheduled",
      event,
      event.requestId,
      event.organizationId,
      event.workspaceId
    );
  }

  async emitRetryExhausted(event: {
    requestId: string;
    totalAttempts: number;
    lastError: string;
    organizationId?: string | undefined;
    workspaceId?: string | undefined;
  }): Promise<void> {
    await this.emitOutboxEvent(
      "gateway.retry.exhausted",
      event,
      event.requestId,
      event.organizationId,
      event.workspaceId
    );
  }

  async emitSecurityEvent(
    type: string,
    data: Record<string, unknown>,
    requestId?: string | undefined
  ): Promise<void> {
    const id = createPublicId("sec");
    await this.db.insert(securityEvents).values({
      id,
      type,
      severity: "warn",
      metadata: data,
      requestId: requestId ?? createPublicId("req"),
      createdAt: new Date(),
    });
  }

  private async emitOutboxEvent(
    topic: string,
    payload: Record<string, unknown>,
    requestId?: string,
    organizationId?: string,
    workspaceId?: string
  ): Promise<void> {
    const id = createPublicId("evt");
    await this.db.insert(outbox).values({
      id,
      topic,
      payload: { ...payload, requestId },
      organizationId: organizationId || null,
      workspaceId: workspaceId || null,
      createdAt: new Date(),
    });
  }
}
