import { createHash } from "node:crypto";
import { Decimal } from "@growx/money";
import { createPublicId } from "@growx/ids";
import type {
  PaymentProviderAdapter,
  PaymentCustomer,
  PaymentMethodReference,
  CheckoutSession,
  Payment,
  PaymentAttempt,
  PaymentProviderEvent,
  PaymentRefund,
  NormalizedPaymentEvent,
} from "@growx/payments";
import { MockPaymentProviderAdapter } from "@growx/payments";
import type {
  IPaymentRepository,
  CreateSubscriptionCheckoutParams,
  RefundParams,
  WebhookProcessResult,
} from "../domain/types.js";
import type { SubscriptionService } from "@growx/subscription-service";

export type PaymentEventListener = (event: NormalizedPaymentEvent, payment?: Payment) => Promise<void>;

export interface PaymentServiceOptions {
  repository: IPaymentRepository;
  subscriptionService?: SubscriptionService;
  providers?: PaymentProviderAdapter[];
  defaultProvider?: string;
  idGenerator?: (prefix: string) => string;
}

export class PaymentService {
  private readonly repository: IPaymentRepository;
  private readonly subscriptionService?: SubscriptionService;
  private readonly providers = new Map<string, PaymentProviderAdapter>();
  private readonly defaultProvider: string;
  private readonly idGenerator: (prefix: string) => string;

  private onPaymentSuccessListeners: PaymentEventListener[] = [];
  private onPaymentFailedListeners: PaymentEventListener[] = [];

  constructor(options: PaymentServiceOptions) {
    this.repository = options.repository;
    this.subscriptionService = options.subscriptionService;
    this.defaultProvider = options.defaultProvider ?? "mock";
    this.idGenerator =
      options.idGenerator ??
      ((p) => createPublicId(p as any) || `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);

    const adapters = options.providers ?? [new MockPaymentProviderAdapter()];
    for (const a of adapters) {
      this.providers.set(a.providerName, a);
    }
  }

  registerProvider(adapter: PaymentProviderAdapter) {
    this.providers.set(adapter.providerName, adapter);
  }

  onPaymentSuccess(listener: PaymentEventListener) {
    this.onPaymentSuccessListeners.push(listener);
  }

  onPaymentFailed(listener: PaymentEventListener) {
    this.onPaymentFailedListeners.push(listener);
  }

  private getProvider(name?: string): PaymentProviderAdapter {
    const providerName = name ?? this.defaultProvider;
    const adapter = this.providers.get(providerName);
    if (!adapter) {
      throw new Error(`Payment provider '${providerName}' is not registered or supported`);
    }
    return adapter;
  }

  // ─── Customer Management ─────────────────────────────────────

  async getOrCreateCustomer(organizationId: string, providerName?: string, email?: string): Promise<PaymentCustomer> {
    const provider = this.getProvider(providerName);
    const existing = await this.repository.getCustomerByOrgAndProvider(organizationId, provider.providerName);
    if (existing) return existing;

    const result = await provider.createCustomer({
      organizationId,
      email,
      idempotencyKey: `cus_${organizationId}_${provider.providerName}`,
    });

    const now = new Date();
    const customer: PaymentCustomer = {
      id: this.idGenerator("pcus"),
      organizationId,
      provider: provider.providerName,
      providerCustomerId: result.providerCustomerId,
      status: "active",
      email,
      createdAt: now,
      updatedAt: now,
    };

    await this.repository.saveCustomer(customer);
    return customer;
  }

  // ─── Checkout Sessions ───────────────────────────────────────

  async createSubscriptionCheckout(params: CreateSubscriptionCheckoutParams): Promise<CheckoutSession> {
    // 1. Idempotency check: same org + key returns existing session
    const existing = await this.repository.getCheckoutSessionByIdempotency(
      params.organizationId,
      params.idempotencyKey
    );
    if (existing) return existing;

    // 2. Server-authoritative price & currency resolution from SubscriptionService
    if (!this.subscriptionService) {
      throw new Error("SubscriptionService is required for subscription checkout");
    }

    let planVersion = params.planVersionId
      ? await (this.subscriptionService as any).repository.getPlanVersionById(params.planVersionId)
      : await (this.subscriptionService as any).repository.getActivePlanVersion(params.planId);

    if (!planVersion) {
      throw new Error(`No active version found for plan '${params.planId}'`);
    }

    const amount: Decimal = planVersion.basePriceAmount;
    const currency: string = planVersion.currency ?? "USD";

    // 3. Provider checkout creation
    const provider = this.getProvider(params.provider);
    const customer = await this.getOrCreateCustomer(params.organizationId, provider.providerName);

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24-hour expiry

    const sessionResult = await provider.createCheckoutSession({
      organizationId: params.organizationId,
      providerCustomerId: customer.providerCustomerId,
      amount,
      currency,
      purpose: `Subscription: ${planVersion.displayName ?? params.planId}`,
      successUrl: params.successReturnUrl,
      cancelUrl: params.cancelReturnUrl,
      idempotencyKey: params.idempotencyKey,
      metadata: {
        organizationId: params.organizationId,
        planId: params.planId,
        planVersionId: planVersion.id,
        ...params.metadata,
      },
      expiresAt,
    });

    const session: CheckoutSession = {
      id: this.idGenerator("cs"),
      organizationId: params.organizationId,
      provider: provider.providerName,
      purpose: "subscription_start",
      planId: params.planId,
      planVersionId: planVersion.id,
      amount,
      currency,
      status: "open",
      providerSessionId: sessionResult.providerSessionId,
      checkoutUrl: sessionResult.checkoutUrl,
      successReturnUrl: params.successReturnUrl,
      cancelReturnUrl: params.cancelReturnUrl,
      idempotencyKey: params.idempotencyKey,
      metadata: params.metadata ?? {},
      expiresAt,
      createdAt: now,
    };

    await this.repository.saveCheckoutSession(session);
    return session;
  }

  // ─── Direct Payments & Renewal Intent ────────────────────────

  async createRenewalPayment(params: {
    organizationId: string;
    subscriptionId: string;
    amount: Decimal;
    currency: string;
    idempotencyKey: string;
    provider?: string;
  }): Promise<Payment> {
    const existing = await this.repository.getPaymentByIdempotency(params.organizationId, params.idempotencyKey);
    if (existing) return existing;

    const provider = this.getProvider(params.provider);
    const customer = await this.getOrCreateCustomer(params.organizationId, provider.providerName);
    const defaultMethod = await this.repository.getDefaultPaymentMethod(params.organizationId);

    const now = new Date();
    const paymentId = this.idGenerator("pay");

    const result = await provider.createPaymentIntent({
      organizationId: params.organizationId,
      providerCustomerId: customer.providerCustomerId,
      providerPaymentMethodId: defaultMethod?.providerPaymentMethodId,
      amount: params.amount,
      currency: params.currency,
      purpose: `Subscription Renewal: ${params.subscriptionId}`,
      idempotencyKey: params.idempotencyKey,
      confirmImmediate: true,
    });

    const payment: Payment = {
      id: paymentId,
      organizationId: params.organizationId,
      provider: provider.providerName,
      providerPaymentId: result.providerPaymentId,
      paymentCustomerId: customer.id,
      purpose: "subscription_renewal",
      referenceType: "subscription",
      referenceId: params.subscriptionId,
      amount: params.amount,
      currency: params.currency,
      status: result.status,
      failureCategory: result.failureCategory,
      failureMessage: result.failureMessage,
      refundedAmount: Decimal.ZERO,
      idempotencyKey: params.idempotencyKey,
      metadata: { subscriptionId: params.subscriptionId },
      createdAt: now,
      updatedAt: now,
      capturedAt: result.status === "succeeded" ? now : undefined,
      failedAt: result.status === "failed" ? now : undefined,
    };

    const attempt: PaymentAttempt = {
      id: this.idGenerator("patt"),
      paymentId,
      provider: provider.providerName,
      providerAttemptId: result.providerPaymentId,
      attemptNumber: 1,
      status: result.status === "succeeded" ? "succeeded" : result.status === "requires_action" ? "requires_action" : "failed",
      failureCategory: result.failureCategory,
      failureMessage: result.failureMessage,
      startedAt: now,
      completedAt: now,
    };

    await this.repository.withTransaction(async (tx) => {
      await tx.savePayment(payment);
      await tx.savePaymentAttempt(attempt);
    });

    return payment;
  }

  // ─── Webhook Ingestion & Processing ──────────────────────────

  async processWebhook(params: {
    provider: string;
    rawPayload: Uint8Array;
    signature: string;
    headers?: Record<string, string>;
  }): Promise<WebhookProcessResult> {
    const provider = this.getProvider(params.provider);

    // 1. Raw-body cryptographic signature verification
    const verifyResult = await provider.verifyWebhook(params.rawPayload, params.signature, params.headers);
    if (!verifyResult.verified) {
      return {
        status: "failed",
        error: "Invalid webhook signature",
      };
    }

    const normEvent = verifyResult.event;
    const rawPayloadHash = createHash("sha256").update(params.rawPayload).digest("hex");

    // 2. Durable event persistence & idempotency check (provider + providerEventId)
    const existingEvent = await this.repository.getProviderEvent(provider.providerName, normEvent.eventId);
    if (existingEvent && existingEvent.processingStatus === "processed") {
      return {
        status: "duplicate",
        eventId: normEvent.eventId,
        eventType: normEvent.eventType,
      };
    }

    const now = new Date();
    const eventRecord: PaymentProviderEvent = {
      id: existingEvent?.id ?? this.idGenerator("pevt"),
      provider: provider.providerName,
      providerEventId: normEvent.eventId,
      eventType: normEvent.eventType,
      receivedAt: now,
      verified: true,
      processingStatus: "pending",
      rawPayloadHash,
      eventCreatedAt: normEvent.occurredAt,
    };

    if (!existingEvent) {
      await this.repository.saveProviderEvent(eventRecord);
    }

    // 3. Process normalized event
    try {
      let matchedPayment: Payment | undefined;

      if (normEvent.providerPaymentId) {
        matchedPayment = await this.repository.getPaymentByProviderPaymentId(
          provider.providerName,
          normEvent.providerPaymentId
        );
      }

      // Handle checkout completed / payment succeeded
      if (normEvent.eventType === "payment.succeeded" || normEvent.eventType === "checkout.completed") {
        if (normEvent.providerSessionId) {
          const session = await this.repository.getCheckoutSessionByProviderSession(
            provider.providerName,
            normEvent.providerSessionId
          );
          if (session) {
            await this.repository.updateCheckoutSession(session.id, {
              status: "completed",
              completedAt: now,
            });

            // Create/update payment for this completed checkout
            if (!matchedPayment) {
              matchedPayment = {
                id: this.idGenerator("pay"),
                organizationId: session.organizationId,
                provider: provider.providerName,
                providerPaymentId: normEvent.providerPaymentId ?? `pay_from_${session.id}`,
                purpose: session.purpose,
                referenceType: "checkout_session",
                referenceId: session.id,
                amount: session.amount,
                currency: session.currency,
                status: "succeeded",
                refundedAmount: Decimal.ZERO,
                idempotencyKey: `pay_cs_${session.id}`,
                metadata: {
                  ...session.metadata,
                  planId: session.planId,
                  planVersionId: session.planVersionId,
                },
                createdAt: now,
                capturedAt: now,
                updatedAt: now,
              };
              await this.repository.savePayment(matchedPayment);
            }
          }
        }

        if (matchedPayment && matchedPayment.status !== "succeeded") {
          await this.repository.updatePayment(matchedPayment.id, {
            status: "succeeded",
            capturedAt: now,
          });
          matchedPayment.status = "succeeded";
        }

        // Notify success listeners
        for (const listener of this.onPaymentSuccessListeners) {
          await listener(normEvent, matchedPayment);
        }
      } else if (normEvent.eventType === "payment.failed") {
        if (matchedPayment) {
          await this.repository.updatePayment(matchedPayment.id, {
            status: "failed",
            failedAt: now,
            failureCategory: normEvent.failureCategory ?? "unknown",
            failureMessage: normEvent.failureMessage,
          });
        }
        for (const listener of this.onPaymentFailedListeners) {
          await listener(normEvent, matchedPayment);
        }
      }

      await this.repository.updateProviderEvent(eventRecord.id, {
        processingStatus: "processed",
        processedAt: new Date(),
      });

      return {
        status: "processed",
        eventId: normEvent.eventId,
        eventType: normEvent.eventType,
      };
    } catch (err: any) {
      await this.repository.updateProviderEvent(eventRecord.id, {
        processingStatus: "failed",
        error: err?.message ?? "Unknown processing error",
      });
      throw err;
    }
  }

  // ─── Refunds ─────────────────────────────────────────────────

  async refundPayment(params: RefundParams): Promise<PaymentRefund> {
    const existing = await this.repository.getRefundByIdempotency(params.organizationId, params.idempotencyKey);
    if (existing) return existing;

    const payment = await this.repository.getPaymentById(params.paymentId);
    if (!payment) throw new Error(`Payment ${params.paymentId} not found`);
    if (payment.organizationId !== params.organizationId) {
      throw new Error("Payment does not belong to this organization");
    }
    if (payment.status !== "succeeded" && payment.status !== "partially_refunded") {
      throw new Error(`Cannot refund payment in '${payment.status}' status`);
    }

    const availableToRefund = payment.amount.sub(payment.refundedAmount);
    const refundAmount = params.amount ?? availableToRefund;

    if (refundAmount.lte(Decimal.ZERO)) {
      throw new Error("Refund amount must be greater than 0");
    }
    if (refundAmount.gt(availableToRefund)) {
      throw new Error(
        `Refund amount ${refundAmount} exceeds available refundable amount ${availableToRefund}`
      );
    }

    const provider = this.getProvider(payment.provider);
    const result = await provider.refundPayment({
      providerPaymentId: payment.providerPaymentId ?? payment.id,
      amount: refundAmount,
      currency: payment.currency,
      reason: params.reason,
      idempotencyKey: params.idempotencyKey,
    });

    const now = new Date();
    const refund: PaymentRefund = {
      id: this.idGenerator("ref"),
      paymentId: payment.id,
      organizationId: params.organizationId,
      provider: payment.provider,
      providerRefundId: result.providerRefundId,
      amount: refundAmount,
      currency: payment.currency,
      reason: params.reason,
      status: result.status,
      idempotencyKey: params.idempotencyKey,
      createdBy: params.createdBy,
      createdAt: now,
      completedAt: result.status === "succeeded" ? now : undefined,
    };

    await this.repository.withTransaction(async (tx) => {
      await tx.saveRefund(refund);
      if (result.status === "succeeded") {
        const newRefunded = payment.refundedAmount.add(refundAmount);
        const newStatus = newRefunded.gte(payment.amount) ? "refunded" : "partially_refunded";
        await tx.updatePayment(payment.id, {
          refundedAmount: newRefunded,
          status: newStatus,
        });
      }
    });

    return refund;
  }

  // ─── Reconciliation ──────────────────────────────────────────

  async reconcilePayment(paymentId: string): Promise<Payment> {
    const payment = await this.repository.getPaymentById(paymentId);
    if (!payment) throw new Error(`Payment ${paymentId} not found`);

    if (payment.status === "succeeded" || payment.status === "refunded") {
      return payment;
    }

    const provider = this.getProvider(payment.provider);
    const external = await provider.retrievePayment(payment.providerPaymentId ?? payment.id);

    if (external.status !== payment.status) {
      const now = new Date();
      await this.repository.updatePayment(paymentId, {
        status: external.status,
        capturedAt: external.status === "succeeded" ? now : undefined,
        failedAt: external.status === "failed" ? now : undefined,
        failureCategory: external.failureCategory,
        failureMessage: external.failureMessage,
      });

      if (external.status === "succeeded") {
        for (const listener of this.onPaymentSuccessListeners) {
          await listener({
            provider: provider.providerName,
            eventId: `reconcile_${paymentId}`,
            eventType: "payment.succeeded",
            providerPaymentId: payment.providerPaymentId,
            amount: external.amount,
            currency: external.currency,
            status: "succeeded",
            occurredAt: now,
            metadata: payment.metadata,
          }, payment);
        }
      }
    }

    return (await this.repository.getPaymentById(paymentId))!;
  }

  // ─── Queries ─────────────────────────────────────────────────

  async getPayment(organizationId: string, paymentId: string): Promise<Payment | undefined> {
    const payment = await this.repository.getPaymentById(paymentId);
    if (payment && payment.organizationId === organizationId) {
      return payment;
    }
    return undefined;
  }

  async listPayments(organizationId: string, limit = 50): Promise<Payment[]> {
    return this.repository.listPayments(organizationId, { limit });
  }

  async getCheckoutSession(organizationId: string, sessionId: string): Promise<CheckoutSession | undefined> {
    const s = await this.repository.getCheckoutSessionById(sessionId);
    if (s && s.organizationId === organizationId) {
      return s;
    }
    return undefined;
  }
}
