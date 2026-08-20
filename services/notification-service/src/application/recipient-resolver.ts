import type {
  NotificationIntent,
  NotificationRecipient,
} from "@growx/notifications";

export class RecipientResolver {
  /**
   * Resolves target recipients based on the intent type, organization, and explicit payload metadata.
   */
  static resolveRecipients(
    intent: NotificationIntent,
    explicitRecipients?: readonly NotificationRecipient[] | undefined
  ): NotificationRecipient[] {
    if (explicitRecipients && explicitRecipients.length > 0) {
      return [...explicitRecipients];
    }

    const recipients: NotificationRecipient[] = [];

    // 1. Direct recipient passed in event data
    if (intent.data.recipientEmail || intent.data.email) {
      recipients.push({
        userId: intent.data.userId as string | undefined,
        email: (intent.data.recipientEmail ?? intent.data.email) as string,
        organizationId: intent.organizationId,
        workspaceId: intent.workspaceId,
      });
      return recipients;
    }

    if (intent.data.userId) {
      recipients.push({
        userId: intent.data.userId as string,
        organizationId: intent.organizationId,
        workspaceId: intent.workspaceId,
      });
      return recipients;
    }

    // 2. Default fallback for tenant notifications
    if (intent.organizationId) {
      recipients.push({
        organizationId: intent.organizationId,
        role: "admin",
        email: `admin@${intent.organizationId}.example.com`,
      });
    }

    return recipients;
  }
}
