import type { INotificationRepository } from "../domain/types.js";
import type { NotificationDeliveryService } from "./notification-delivery-service.js";

export class EscalationService {
  constructor(
    private readonly repository: INotificationRepository,
    private readonly deliveryService: NotificationDeliveryService,
  ) {}

  /**
   * Processes due security alert escalations.
   */
  async processDueEscalations(
    now: Date = new Date(),
    signalStatusChecker?: (signalId: string) => Promise<string | undefined>,
  ): Promise<number> {
    const due = await this.repository.getPendingEscalations(now);
    let processed = 0;

    for (const esc of due) {
      // 1. Check if the underlying security signal was already acknowledged/resolved
      if (esc.signalId && signalStatusChecker) {
        const signalStatus = await signalStatusChecker(esc.signalId);
        if (
          signalStatus === "acknowledged" ||
          signalStatus === "resolved" ||
          signalStatus === "false_positive"
        ) {
          await this.repository.updateEscalation(esc.id, {
            status: "cancelled",
          });
          continue;
        }
      }

      // 2. Fetch original intent
      const intent = await this.repository.getIntent(esc.intentId);
      if (!intent) {
        await this.repository.updateEscalation(esc.id, { status: "completed" });
        continue;
      }

      // 3. Dispatch secondary escalation notification
      if (intent.organizationId) {
        await this.deliveryService.ingestAndFanout(
          {
            id: `esc_${intent.sourceEventId}_${esc.escalationCount + 1}`,
            type: "security.alert",
            organizationId: intent.organizationId,
            workspaceId: intent.workspaceId,
            data: {
              ...intent.data,
              title: `[ESCALATED] ${intent.data.title}`,
              description: `Escalated Alert: ${intent.data.description}`,
            },
          },
          [
            {
              organizationId: intent.organizationId,
              role: "security_admin",
              email: `security-escalations@${intent.organizationId}.example.com`,
            },
          ],
        );
      }

      const nextCount = esc.escalationCount + 1;
      if (nextCount >= esc.maxEscalations) {
        await this.repository.updateEscalation(esc.id, {
          escalationCount: nextCount,
          status: "completed",
        });
      } else {
        await this.repository.updateEscalation(esc.id, {
          escalationCount: nextCount,
          nextEscalationAt: new Date(now.getTime() + 15 * 60 * 1000),
        });
      }

      processed++;
    }

    return processed;
  }
}
