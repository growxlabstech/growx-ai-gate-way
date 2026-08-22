import { generateId } from "@growx/ids";
import {
  getNotificationPolicy,
  type NotificationIntent,
} from "@growx/notifications";

export interface DomainEventInput {
  id: string; // sourceEventId
  type: string; // e.g. "auth.otp.v1", "credit.low.v1", "security.signal.created.v1"
  organizationId?: string | undefined;
  workspaceId?: string | undefined;
  data: Record<string, any>;
  createdAt?: Date | undefined;
}

export class NotificationEventMapper {
  /**
   * Translates a domain event into an immutable canonical NotificationIntent.
   */
  static mapDomainEventToIntent(event: DomainEventInput): NotificationIntent {
    // Strip version suffix if present: "credit.low.v1" -> "credit.low"
    const cleanType = event.type.replace(/\.v\d+$/, "");
    const policy = getNotificationPolicy(cleanType);

    if (!policy) {
      throw new Error(
        `Unsupported domain notification event type: ${event.type}`,
      );
    }

    const now = event.createdAt ?? new Date();
    const expiresAt = policy.expiresInSeconds
      ? new Date(now.getTime() + policy.expiresInSeconds * 1000)
      : undefined;

    return {
      id: generateId("ntfi"),
      sourceEventId: event.id,
      organizationId: event.organizationId,
      workspaceId: event.workspaceId,
      category: policy.category,
      type: cleanType,
      priority: policy.priority,
      preferenceMode: policy.preferenceMode,
      templateKey: policy.templateKey,
      templateVersion: policy.version,
      data: event.data,
      createdAt: now,
      expiresAt,
    };
  }
}
