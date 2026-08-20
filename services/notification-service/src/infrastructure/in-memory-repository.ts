import type {
  InAppNotification,
  NotificationDelivery,
  NotificationDeliveryAttempt,
  NotificationEscalationState,
  NotificationIntent,
  NotificationPreference,
  NotificationPriority,
  NotificationSuppression,
  OrganizationNotificationSettings,
} from "@growx/notifications";
import type {
  INotificationRepository,
  ListDeliveriesParams,
  ListInAppParams,
} from "../domain/types.js";

const PRIORITY_WEIGHTS: Record<NotificationPriority, number> = {
  critical: 4,
  high: 3,
  normal: 2,
  low: 1,
};

export class InMemoryNotificationRepository implements INotificationRepository {
  public readonly intents: Map<string, NotificationIntent> = new Map();
  public readonly deliveries: Map<string, NotificationDelivery> = new Map();
  public readonly attempts: Map<string, NotificationDeliveryAttempt[]> = new Map();
  public readonly inAppNotifications: Map<string, InAppNotification> = new Map();
  public readonly suppressions: Map<string, NotificationSuppression> = new Map();
  public readonly preferences: Map<string, NotificationPreference> = new Map();
  public readonly orgSettings: Map<string, OrganizationNotificationSettings> = new Map();
  public readonly escalations: Map<string, NotificationEscalationState> = new Map();

  // ─── Intents ────────────────────────────────────────────────
  async createIntent(intent: NotificationIntent): Promise<NotificationIntent> {
    this.intents.set(intent.id, intent);
    return intent;
  }

  async getIntent(id: string): Promise<NotificationIntent | undefined> {
    return this.intents.get(id);
  }

  async findIntentBySource(
    sourceEventId: string,
    type: string
  ): Promise<NotificationIntent | undefined> {
    for (const intent of this.intents.values()) {
      if (intent.sourceEventId === sourceEventId && intent.type === type) {
        return intent;
      }
    }
    return undefined;
  }

  async listIntents(params: {
    organizationId?: string | undefined;
    type?: string | undefined;
    limit?: number | undefined;
  }): Promise<NotificationIntent[]> {
    let results = Array.from(this.intents.values());
    if (params.organizationId) {
      results = results.filter((i) => i.organizationId === params.organizationId);
    }
    if (params.type) {
      results = results.filter((i) => i.type === params.type);
    }
    results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    if (params.limit && params.limit > 0) {
      results = results.slice(0, params.limit);
    }
    return results;
  }

  // ─── Deliveries & Queue ─────────────────────────────────────
  async createDeliveries(
    deliveries: readonly NotificationDelivery[]
  ): Promise<NotificationDelivery[]> {
    for (const d of deliveries) {
      this.deliveries.set(d.id, d);
    }
    return [...deliveries];
  }

  async getDelivery(id: string): Promise<NotificationDelivery | undefined> {
    return this.deliveries.get(id);
  }

  async listDeliveries(params: ListDeliveriesParams): Promise<NotificationDelivery[]> {
    let results = Array.from(this.deliveries.values());
    if (params.intentId) {
      results = results.filter((d) => d.intentId === params.intentId);
    }
    if (params.recipientSnapshot) {
      results = results.filter((d) => d.recipientSnapshot === params.recipientSnapshot);
    }
    if (params.status) {
      results = results.filter((d) => d.status === params.status);
    }
    if (params.channel) {
      results = results.filter((d) => d.channel === params.channel);
    }
    if (params.priority) {
      results = results.filter((d) => d.priority === params.priority);
    }
    results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    if (params.limit && params.limit > 0) {
      results = results.slice(0, params.limit);
    }
    return results;
  }

  async claimPendingDeliveries(
    batchSize: number,
    leaseDurationMs: number,
    workerId: string
  ): Promise<NotificationDelivery[]> {
    const now = new Date();
    const eligible: NotificationDelivery[] = [];

    for (const d of this.deliveries.values()) {
      const isLeaseExpired = !d.leaseExpiresAt || d.leaseExpiresAt <= now;
      const isStatusEligible =
        d.status === "pending" ||
        d.status === "retrying" ||
        (d.status === "sending" && isLeaseExpired);
      const isTimeEligible = !d.nextAttemptAt || d.nextAttemptAt <= now;

      if (isStatusEligible && isTimeEligible && isLeaseExpired) {
        eligible.push(d);
      }
    }

    // Sort by priority (critical > high > normal > low), then scheduledAt
    eligible.sort((a, b) => {
      const pA = PRIORITY_WEIGHTS[a.priority] ?? 2;
      const pB = PRIORITY_WEIGHTS[b.priority] ?? 2;
      if (pA !== pB) return pB - pA;
      return a.scheduledAt.getTime() - b.scheduledAt.getTime();
    });

    const claimed = eligible.slice(0, batchSize);
    const leaseExpiresAt = new Date(now.getTime() + leaseDurationMs);

    const updatedClaimed: NotificationDelivery[] = claimed.map((d) => ({
      ...d,
      status: "sending",
      leaseOwner: workerId,
      leaseExpiresAt,
      updatedAt: now,
    }));

    for (const u of updatedClaimed) {
      this.deliveries.set(u.id, u);
    }

    return updatedClaimed;
  }

  async updateDelivery(
    id: string,
    updates: Partial<NotificationDelivery>
  ): Promise<NotificationDelivery> {
    const existing = this.deliveries.get(id);
    if (!existing) throw new Error(`Delivery not found: ${id}`);
    const updated = { ...existing, ...updates, updatedAt: new Date() };
    this.deliveries.set(id, updated);
    return updated;
  }

  // ─── Delivery Attempts ──────────────────────────────────────
  async createAttempt(
    attempt: NotificationDeliveryAttempt
  ): Promise<NotificationDeliveryAttempt> {
    const list = this.attempts.get(attempt.deliveryId) ?? [];
    list.push(attempt);
    this.attempts.set(attempt.deliveryId, list);
    return attempt;
  }

  async listAttempts(deliveryId: string): Promise<NotificationDeliveryAttempt[]> {
    return this.attempts.get(deliveryId) ?? [];
  }

  // ─── In-App Notifications ───────────────────────────────────
  async createInAppNotification(
    notification: InAppNotification
  ): Promise<InAppNotification> {
    this.inAppNotifications.set(notification.id, notification);
    return notification;
  }

  async getInAppNotification(id: string): Promise<InAppNotification | undefined> {
    return this.inAppNotifications.get(id);
  }

  async listInAppNotifications(
    userId: string,
    params?: ListInAppParams
  ): Promise<InAppNotification[]> {
    let results = Array.from(this.inAppNotifications.values()).filter(
      (n) => n.userId === userId
    );

    if (params?.unreadOnly) {
      results = results.filter((n) => !n.readAt);
    }

    results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    if (params?.limit && params.limit > 0) {
      results = results.slice(0, params.limit);
    }

    return results;
  }

  async markInAppRead(
    userId: string,
    id: string
  ): Promise<InAppNotification | undefined> {
    const n = this.inAppNotifications.get(id);
    if (!n || n.userId !== userId) return undefined;
    const updated = { ...n, readAt: new Date() };
    this.inAppNotifications.set(id, updated);
    return updated;
  }

  async markAllInAppRead(userId: string): Promise<number> {
    let count = 0;
    const now = new Date();
    for (const n of this.inAppNotifications.values()) {
      if (n.userId === userId && !n.readAt) {
        this.inAppNotifications.set(n.id, { ...n, readAt: now });
        count++;
      }
    }
    return count;
  }

  // ─── Suppressions ───────────────────────────────────────────
  async getSuppression(destination: string): Promise<NotificationSuppression | undefined> {
    return this.suppressions.get(destination.toLowerCase().trim());
  }

  async createSuppression(
    suppression: NotificationSuppression
  ): Promise<NotificationSuppression> {
    this.suppressions.set(suppression.destination.toLowerCase().trim(), suppression);
    return suppression;
  }

  // ─── Preferences & Settings ─────────────────────────────────
  async getPreferences(
    userId: string,
    organizationId?: string | undefined
  ): Promise<NotificationPreference[]> {
    return Array.from(this.preferences.values()).filter(
      (p) =>
        p.userId === userId &&
        (organizationId ? p.organizationId === organizationId : true)
    );
  }

  async updatePreference(
    preference: NotificationPreference
  ): Promise<NotificationPreference> {
    const key = `${preference.userId}:${preference.organizationId ?? "none"}:${
      preference.category
    }:${preference.channel}`;
    this.preferences.set(key, preference);
    return preference;
  }

  async getOrganizationSettings(
    organizationId: string
  ): Promise<OrganizationNotificationSettings | undefined> {
    return this.orgSettings.get(organizationId);
  }

  async updateOrganizationSettings(
    settings: OrganizationNotificationSettings
  ): Promise<OrganizationNotificationSettings> {
    this.orgSettings.set(settings.organizationId, settings);
    return settings;
  }

  // ─── Escalations ────────────────────────────────────────────
  async createEscalation(
    escalation: NotificationEscalationState
  ): Promise<NotificationEscalationState> {
    this.escalations.set(escalation.id, escalation);
    return escalation;
  }

  async getPendingEscalations(now: Date): Promise<NotificationEscalationState[]> {
    return Array.from(this.escalations.values()).filter(
      (e) => e.status === "pending" && e.nextEscalationAt <= now
    );
  }

  async updateEscalation(
    id: string,
    updates: Partial<NotificationEscalationState>
  ): Promise<NotificationEscalationState> {
    const existing = this.escalations.get(id);
    if (!existing) throw new Error(`Escalation not found: ${id}`);
    const updated = { ...existing, ...updates, updatedAt: new Date() };
    this.escalations.set(id, updated);
    return updated;
  }
}
