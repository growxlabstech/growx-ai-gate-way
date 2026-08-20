import type {
  NotificationChannel,
  NotificationIntent,
  NotificationRecipient,
} from "@growx/notifications";
import type { INotificationRepository } from "../domain/types.js";

export class PreferenceResolver {
  constructor(private readonly repository: INotificationRepository) {}

  /**
   * Determines whether a recipient should receive a notification on a specific channel.
   * Mandatory notifications (e.g. OTP, security alerts, payment failures) always bypass opt-out.
   */
  async shouldDeliver(
    recipient: NotificationRecipient,
    intent: NotificationIntent,
    channel: NotificationChannel
  ): Promise<boolean> {
    // 1. Mandatory notifications cannot be disabled by user or organization preferences
    if (intent.preferenceMode === "mandatory") {
      return true;
    }

    // 2. Organization settings check
    if (recipient.organizationId) {
      const orgSettings = await this.repository.getOrganizationSettings(
        recipient.organizationId
      );
      if (orgSettings) {
        if (intent.category === "security" && !orgSettings.securityAlertsEnabled) {
          return false;
        }
        if (intent.category === "billing" && !orgSettings.billingAlertsEnabled) {
          return false;
        }
        if (intent.category === "usage" && !orgSettings.usageAlertsEnabled) {
          return false;
        }
      }
    }

    // 3. User preferences check
    if (recipient.userId) {
      const userPrefs = await this.repository.getPreferences(
        recipient.userId,
        recipient.organizationId
      );
      const match = userPrefs.find(
        (p) => p.category === intent.category && p.channel === channel
      );
      if (match) {
        return match.enabled;
      }
    }

    // 4. Default: allow delivery if in catalog default channels
    return true;
  }
}
