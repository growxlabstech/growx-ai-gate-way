import { generateId } from "@growx/ids";
import {
  calculateNextNotificationAttemptMs,
  classifyNotificationOutcome,
  DEFAULT_NOTIFICATION_RETRY_POLICY,
  getNotificationPolicy,
  renderNotificationContent,
  type InAppNotification,
  type NotificationDelivery,
  type NotificationDeliveryAttempt,
  type NotificationEscalationState,
  type NotificationIntent,
  type NotificationRecipient,
} from "@growx/notifications";
import type { INotificationRepository } from "../domain/types.js";
import type { EmailProviderAdapter } from "../infrastructure/resend-adapter.js";
import {
  NotificationEventMapper,
  type DomainEventInput,
} from "./notification-event-mapper.js";
import { PreferenceResolver } from "./preference-resolver.js";
import { RecipientResolver } from "./recipient-resolver.js";

export interface NotificationDeliveryServiceOptions {
  repository: INotificationRepository;
  emailAdapter: EmailProviderAdapter;
}

export class NotificationDeliveryService {
  private readonly repository: INotificationRepository;
  private readonly emailAdapter: EmailProviderAdapter;
  private readonly preferenceResolver: PreferenceResolver;

  constructor(options: NotificationDeliveryServiceOptions) {
    this.repository = options.repository;
    this.emailAdapter = options.emailAdapter;
    this.preferenceResolver = new PreferenceResolver(this.repository);
  }

  /**
   * Ingests a domain event, deduplicates, resolves recipients, checks preferences, and fans out delivery jobs.
   */
  async ingestAndFanout(
    sourceEvent: DomainEventInput,
    explicitRecipients?: readonly NotificationRecipient[] | undefined
  ): Promise<{
    intent: NotificationIntent;
    deliveries: NotificationDelivery[];
    inAppNotifications: InAppNotification[];
  }> {
    const cleanType = sourceEvent.type.replace(/\.v\d+$/, "");

    // 1. Idempotency check: has this source event already produced an intent?
    const existing = await this.repository.findIntentBySource(
      sourceEvent.id,
      cleanType
    );
    if (existing) {
      const existingDeliveries = await this.repository.listDeliveries({
        intentId: existing.id,
      });
      return { intent: existing, deliveries: existingDeliveries, inAppNotifications: [] };
    }

    // 2. Map to canonical intent
    const intent = NotificationEventMapper.mapDomainEventToIntent(sourceEvent);
    await this.repository.createIntent(intent);

    const policy = getNotificationPolicy(intent.type);
    const targetChannels = policy?.defaultChannels ?? ["email"];
    const recipients = RecipientResolver.resolveRecipients(intent, explicitRecipients);

    const deliveriesToCreate: NotificationDelivery[] = [];
    const inAppToCreate: InAppNotification[] = [];
    const now = new Date();

    for (const recipient of recipients) {
      for (const channel of targetChannels) {
        const allowed = await this.preferenceResolver.shouldDeliver(
          recipient,
          intent,
          channel
        );
        if (!allowed) continue;

        if (channel === "in_app" && recipient.userId) {
          const rendered = renderNotificationContent(
            intent.templateKey,
            "in_app",
            intent.data
          );
          const inApp: InAppNotification = {
            id: generateId("ntf"),
            userId: recipient.userId,
            organizationId: intent.organizationId,
            workspaceId: intent.workspaceId,
            type: intent.type,
            title: rendered.title ?? "Notification",
            body: rendered.body ?? "",
            actionUrl: rendered.actionUrl,
            priority: intent.priority,
            createdAt: now,
            expiresAt: intent.expiresAt,
          };
          inAppToCreate.push(inApp);
          await this.repository.createInAppNotification(inApp);
        }

        if (channel === "email" && recipient.email) {
          const delivery: NotificationDelivery = {
            id: generateId("ntfd"),
            intentId: intent.id,
            recipientId: recipient.userId,
            recipientSnapshot: recipient.email,
            channel: "email",
            status: "pending",
            priority: intent.priority,
            templateKey: intent.templateKey,
            templateVersion: intent.templateVersion,
            scheduledAt: now,
            attemptCount: 0,
            maxAttempts: DEFAULT_NOTIFICATION_RETRY_POLICY.maxAttempts,
            createdAt: now,
            updatedAt: now,
          };
          deliveriesToCreate.push(delivery);
        }
      }
    }

    if (deliveriesToCreate.length > 0) {
      await this.repository.createDeliveries(deliveriesToCreate);
    }

    // 3. Escalation scheduling for critical signals
    if (policy?.escalationPolicy && intent.priority === "critical") {
      const esc: NotificationEscalationState = {
        id: generateId("esc"),
        intentId: intent.id,
        signalId: intent.data.signalId as string | undefined,
        organizationId: intent.organizationId,
        escalationCount: 0,
        maxEscalations: policy.escalationPolicy.maxEscalations,
        nextEscalationAt: new Date(
          now.getTime() + policy.escalationPolicy.escalationDelayMs
        ),
        status: "pending",
        createdAt: now,
        updatedAt: now,
      };
      await this.repository.createEscalation(esc);
    }

    return {
      intent,
      deliveries: deliveriesToCreate,
      inAppNotifications: inAppToCreate,
    };
  }

  /**
   * Claims and processes a priority batch of pending deliveries.
   */
  async processBatch(params: {
    batchSize?: number | undefined;
    leaseDurationMs?: number | undefined;
    workerId?: string | undefined;
  } = {}): Promise<{ delivered: number; retried: number; failed: number }> {
    const batchSize = params.batchSize ?? 10;
    const leaseDurationMs = params.leaseDurationMs ?? 30_000;
    const workerId = params.workerId ?? generateId("wrk");

    const claimed = await this.repository.claimPendingDeliveries(
      batchSize,
      leaseDurationMs,
      workerId
    );

    let delivered = 0;
    let retried = 0;
    let failed = 0;

    for (const d of claimed) {
      const outcome = await this.deliverSingle(d);
      if (outcome.status === "delivered") delivered++;
      else if (outcome.status === "retrying") retried++;
      else failed++;
    }

    return { delivered, retried, failed };
  }

  /**
   * Executes delivery for a single claimed delivery job.
   */
  async deliverSingle(
    delivery: NotificationDelivery
  ): Promise<{ status: string; providerStatus?: number | undefined }> {
    const now = new Date();
    const startedAt = now;
    const attemptNumber = delivery.attemptCount + 1;

    // 1. Fetch Intent
    const intent = await this.repository.getIntent(delivery.intentId);
    if (!intent) {
      await this.repository.updateDelivery(delivery.id, {
        status: "failed",
        failedAt: now,
        leaseExpiresAt: undefined,
      });
      return { status: "failed" };
    }

    // 2. Check Expiration (e.g. expired OTP)
    if (intent.expiresAt && intent.expiresAt <= now) {
      await this.repository.updateDelivery(delivery.id, {
        status: "expired",
        failedAt: now,
        leaseExpiresAt: undefined,
      });
      return { status: "expired" };
    }

    // 3. Check Suppression (hard bounces / complaints)
    const suppression = await this.repository.getSuppression(
      delivery.recipientSnapshot
    );
    if (suppression) {
      await this.repository.updateDelivery(delivery.id, {
        status: "suppressed",
        failedAt: now,
        leaseExpiresAt: undefined,
      });
      return { status: "suppressed" };
    }

    // 4. Render Email Template
    let rendered;
    try {
      rendered = renderNotificationContent(
        delivery.templateKey,
        "email",
        intent.data
      );
    } catch {
      await this.repository.updateDelivery(delivery.id, {
        status: "failed",
        failedAt: now,
        leaseExpiresAt: undefined,
      });
      return { status: "failed" };
    }

    // 5. Send via Provider Adapter
    let providerStatus: number | undefined;
    let providerMessageId: string | undefined;
    let error: Error | undefined;

    try {
      const res = await this.emailAdapter.sendEmail({
        to: delivery.recipientSnapshot,
        subject: rendered.subject!,
        text: rendered.text!,
        html: rendered.html,
      });
      providerStatus = res.providerStatus;
      providerMessageId = res.providerMessageId;
    } catch (err: any) {
      error = err;
      providerStatus = err.status;
    }

    const completedAt = new Date();
    const latencyMs = completedAt.getTime() - startedAt.getTime();

    // 6. Classify Outcome
    const outcome = classifyNotificationOutcome({
      responseStatus: providerStatus,
      error,
      currentAttempt: attemptNumber,
      maxAttempts: delivery.maxAttempts,
    });

    // 7. Record Attempt
    const attempt: NotificationDeliveryAttempt = {
      id: generateId("ntfa"),
      deliveryId: delivery.id,
      attemptNumber,
      provider: "resend",
      startedAt,
      completedAt,
      providerStatus: providerStatus ? String(providerStatus) : undefined,
      providerMessageId,
      errorCategory: outcome.errorCategory,
      retryable: outcome.retryable,
      latencyMs,
    };
    await this.repository.createAttempt(attempt);

    // 8. Update Delivery
    if (outcome.status === "delivered") {
      await this.repository.updateDelivery(delivery.id, {
        status: "delivered",
        provider: "resend",
        providerMessageId,
        completedAt,
        attemptCount: attemptNumber,
        leaseExpiresAt: undefined,
      });
    } else if (outcome.status === "retrying") {
      const delayMs = calculateNextNotificationAttemptMs(attemptNumber);
      const nextAttemptAt = new Date(completedAt.getTime() + delayMs);

      await this.repository.updateDelivery(delivery.id, {
        status: "retrying",
        attemptCount: attemptNumber,
        nextAttemptAt,
        leaseExpiresAt: undefined,
      });
    } else {
      await this.repository.updateDelivery(delivery.id, {
        status: "failed",
        failedAt: completedAt,
        attemptCount: attemptNumber,
        leaseExpiresAt: undefined,
      });
    }

    return { status: outcome.status, providerStatus };
  }

  /**
   * Replays a delivery (rejects expired OTPs).
   */
  async replayDelivery(deliveryId: string): Promise<NotificationDelivery> {
    const original = await this.repository.getDelivery(deliveryId);
    if (!original) throw new Error(`Delivery not found: ${deliveryId}`);

    const intent = await this.repository.getIntent(original.intentId);
    if (!intent) throw new Error(`Intent not found: ${original.intentId}`);

    // Replay Safety: Never replay expired OTPs
    if (intent.type === "auth.otp") {
      throw new Error("Expired or completed OTP notifications cannot be replayed");
    }

    const now = new Date();
    return this.repository.updateDelivery(deliveryId, {
      status: "pending",
      attemptCount: 0,
      scheduledAt: now,
      nextAttemptAt: undefined,
      failedAt: undefined,
      completedAt: undefined,
      leaseExpiresAt: undefined,
    });
  }
}
