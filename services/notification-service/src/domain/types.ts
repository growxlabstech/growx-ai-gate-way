import type {
  InAppNotification,
  NotificationDelivery,
  NotificationDeliveryAttempt,
  NotificationEscalationState,
  NotificationIntent,
  NotificationPreference,
  NotificationSuppression,
  OrganizationNotificationSettings,
} from "@growx/notifications";

export interface ListDeliveriesParams {
  intentId?: string | undefined;
  recipientSnapshot?: string | undefined;
  status?: string | undefined;
  channel?: string | undefined;
  priority?: string | undefined;
  limit?: number | undefined;
}

export interface ListInAppParams {
  unreadOnly?: boolean | undefined;
  limit?: number | undefined;
}

export interface INotificationRepository {
  // ─── Intents ────────────────────────────────────────────────
  createIntent(intent: NotificationIntent): Promise<NotificationIntent>;
  getIntent(id: string): Promise<NotificationIntent | undefined>;
  findIntentBySource(
    sourceEventId: string,
    type: string,
  ): Promise<NotificationIntent | undefined>;
  listIntents(params: {
    organizationId?: string;
    type?: string;
    limit?: number;
  }): Promise<NotificationIntent[]>;

  // ─── Deliveries & Queue ─────────────────────────────────────
  createDeliveries(
    deliveries: readonly NotificationDelivery[],
  ): Promise<NotificationDelivery[]>;
  getDelivery(id: string): Promise<NotificationDelivery | undefined>;
  listDeliveries(params: ListDeliveriesParams): Promise<NotificationDelivery[]>;
  claimPendingDeliveries(
    batchSize: number,
    leaseDurationMs: number,
    workerId: string,
  ): Promise<NotificationDelivery[]>;
  updateDelivery(
    id: string,
    updates: Partial<NotificationDelivery>,
  ): Promise<NotificationDelivery>;

  // ─── Delivery Attempts ──────────────────────────────────────
  createAttempt(
    attempt: NotificationDeliveryAttempt,
  ): Promise<NotificationDeliveryAttempt>;
  listAttempts(deliveryId: string): Promise<NotificationDeliveryAttempt[]>;

  // ─── In-App Notifications ───────────────────────────────────
  createInAppNotification(
    notification: InAppNotification,
  ): Promise<InAppNotification>;
  getInAppNotification(id: string): Promise<InAppNotification | undefined>;
  listInAppNotifications(
    userId: string,
    params?: ListInAppParams,
  ): Promise<InAppNotification[]>;
  markInAppRead(
    userId: string,
    id: string,
  ): Promise<InAppNotification | undefined>;
  markAllInAppRead(userId: string): Promise<number>;

  // ─── Suppressions ───────────────────────────────────────────
  getSuppression(
    destination: string,
  ): Promise<NotificationSuppression | undefined>;
  createSuppression(
    suppression: NotificationSuppression,
  ): Promise<NotificationSuppression>;

  // ─── Preferences & Settings ─────────────────────────────────
  getPreferences(
    userId: string,
    organizationId?: string,
  ): Promise<NotificationPreference[]>;
  updatePreference(
    preference: NotificationPreference,
  ): Promise<NotificationPreference>;
  getOrganizationSettings(
    organizationId: string,
  ): Promise<OrganizationNotificationSettings | undefined>;
  updateOrganizationSettings(
    settings: OrganizationNotificationSettings,
  ): Promise<OrganizationNotificationSettings>;

  // ─── Escalations ────────────────────────────────────────────
  createEscalation(
    escalation: NotificationEscalationState,
  ): Promise<NotificationEscalationState>;
  getPendingEscalations(now: Date): Promise<NotificationEscalationState[]>;
  updateEscalation(
    id: string,
    updates: Partial<NotificationEscalationState>,
  ): Promise<NotificationEscalationState>;
}
