import type { SubscriptionService } from "@growx/subscription-service";
import type { PaymentService } from "./payment-service.js";
import type { NormalizedPaymentEvent, Payment } from "@growx/payments";

export class SubscriptionPaymentCoordinator {
  constructor(
    private readonly paymentService: PaymentService,
    private readonly subscriptionService: SubscriptionService,
  ) {
    this.paymentService.onPaymentSuccess(this.handlePaymentSuccess.bind(this));
  }

  /**
   * Handle payment success event from webhook or manual reconciliation.
   */
  async handlePaymentSuccess(event: NormalizedPaymentEvent, payment?: Payment): Promise<void> {
    if (!payment) return;

    const organizationId = payment.organizationId;
    const purpose = payment.purpose;

    if (purpose === "subscription_start") {
      const planId = (payment.metadata.planId as string) ?? payment.referenceId;
      const planVersionId = payment.metadata.planVersionId as string | undefined;

      if (!planId) return;

      // Check if org already has active subscription (idempotency guard)
      const existingSub = await this.subscriptionService.getActiveSubscription(organizationId);
      if (existingSub) {
        return;
      }

      await this.subscriptionService.createSubscription({
        organizationId,
        planId,
        planVersionId,
        fundingMode: "external_payment_future",
        metadata: {
          externalPaymentId: payment.providerPaymentId,
          paymentId: payment.id,
          provider: payment.provider,
        },
      });
    } else if (purpose === "subscription_renewal") {
      const subscriptionId = (payment.metadata.subscriptionId as string) ?? payment.referenceId;
      if (!subscriptionId) return;

      await this.subscriptionService.processRenewal(subscriptionId);
    }
  }
}
