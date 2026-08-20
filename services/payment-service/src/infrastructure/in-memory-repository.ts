import type {
  PaymentCustomer,
  PaymentMethodReference,
  CheckoutSession,
  Payment,
  PaymentAttempt,
  PaymentProviderEvent,
  PaymentRefund,
} from "@growx/payments";
import type { IPaymentRepository } from "../domain/types.js";

/**
 * Deterministic in-memory repository for unit and integration testing.
 */
export class InMemoryPaymentRepository implements IPaymentRepository {
  readonly customers = new Map<string, PaymentCustomer>();
  readonly paymentMethods = new Map<string, PaymentMethodReference>();
  readonly checkoutSessions = new Map<string, CheckoutSession>();
  readonly payments = new Map<string, Payment>();
  readonly paymentAttempts = new Map<string, PaymentAttempt>();
  readonly providerEvents = new Map<string, PaymentProviderEvent>();
  readonly refunds = new Map<string, PaymentRefund>();

  // ─── Customer ────────────────────────────────────────────────

  async saveCustomer(customer: PaymentCustomer): Promise<void> {
    this.customers.set(customer.id, { ...customer });
  }

  async getCustomerByOrgAndProvider(orgId: string, provider: string): Promise<PaymentCustomer | undefined> {
    for (const c of this.customers.values()) {
      if (c.organizationId === orgId && c.provider === provider) {
        return { ...c };
      }
    }
    return undefined;
  }

  async getCustomerByProviderId(provider: string, providerCustomerId: string): Promise<PaymentCustomer | undefined> {
    for (const c of this.customers.values()) {
      if (c.provider === provider && c.providerCustomerId === providerCustomerId) {
        return { ...c };
      }
    }
    return undefined;
  }

  // ─── Payment Methods ─────────────────────────────────────────

  async savePaymentMethod(method: PaymentMethodReference): Promise<void> {
    this.paymentMethods.set(method.id, { ...method });
  }

  async getPaymentMethods(orgId: string): Promise<PaymentMethodReference[]> {
    return Array.from(this.paymentMethods.values())
      .filter((m) => m.organizationId === orgId && m.status === "active")
      .map((m) => ({ ...m }));
  }

  async getDefaultPaymentMethod(orgId: string): Promise<PaymentMethodReference | undefined> {
    for (const m of this.paymentMethods.values()) {
      if (m.organizationId === orgId && m.isDefault && m.status === "active") {
        return { ...m };
      }
    }
    return undefined;
  }

  // ─── Checkout Sessions ───────────────────────────────────────

  async saveCheckoutSession(session: CheckoutSession): Promise<void> {
    this.checkoutSessions.set(session.id, { ...session });
  }

  async getCheckoutSessionById(id: string): Promise<CheckoutSession | undefined> {
    const s = this.checkoutSessions.get(id);
    return s ? { ...s } : undefined;
  }

  async getCheckoutSessionByIdempotency(orgId: string, idempotencyKey: string): Promise<CheckoutSession | undefined> {
    for (const s of this.checkoutSessions.values()) {
      if (s.organizationId === orgId && s.idempotencyKey === idempotencyKey) {
        return { ...s };
      }
    }
    return undefined;
  }

  async getCheckoutSessionByProviderSession(provider: string, providerSessionId: string): Promise<CheckoutSession | undefined> {
    for (const s of this.checkoutSessions.values()) {
      if (s.provider === provider && s.providerSessionId === providerSessionId) {
        return { ...s };
      }
    }
    return undefined;
  }

  async updateCheckoutSession(id: string, updates: Partial<CheckoutSession>): Promise<void> {
    const existing = this.checkoutSessions.get(id);
    if (!existing) throw new Error(`CheckoutSession ${id} not found`);
    this.checkoutSessions.set(id, { ...existing, ...updates });
  }

  // ─── Payments ────────────────────────────────────────────────

  async savePayment(payment: Payment): Promise<void> {
    this.payments.set(payment.id, { ...payment });
  }

  async getPaymentById(id: string): Promise<Payment | undefined> {
    const p = this.payments.get(id);
    return p ? { ...p } : undefined;
  }

  async getPaymentByProviderPaymentId(provider: string, providerPaymentId: string): Promise<Payment | undefined> {
    for (const p of this.payments.values()) {
      if (p.provider === provider && p.providerPaymentId === providerPaymentId) {
        return { ...p };
      }
    }
    return undefined;
  }

  async getPaymentByIdempotency(orgId: string, idempotencyKey: string): Promise<Payment | undefined> {
    for (const p of this.payments.values()) {
      if (p.organizationId === orgId && p.idempotencyKey === idempotencyKey) {
        return { ...p };
      }
    }
    return undefined;
  }

  async listPayments(orgId: string, filter?: { limit?: number; startingAfter?: string }): Promise<Payment[]> {
    const limit = filter?.limit ?? 50;
    return Array.from(this.payments.values())
      .filter((p) => p.organizationId === orgId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit)
      .map((p) => ({ ...p }));
  }

  async updatePayment(id: string, updates: Partial<Payment>): Promise<void> {
    const existing = this.payments.get(id);
    if (!existing) throw new Error(`Payment ${id} not found`);
    this.payments.set(id, { ...existing, ...updates, updatedAt: new Date() });
  }

  // ─── Payment Attempts ────────────────────────────────────────

  async savePaymentAttempt(attempt: PaymentAttempt): Promise<void> {
    this.paymentAttempts.set(attempt.id, { ...attempt });
  }

  async getPaymentAttempts(paymentId: string): Promise<PaymentAttempt[]> {
    return Array.from(this.paymentAttempts.values())
      .filter((a) => a.paymentId === paymentId)
      .sort((a, b) => a.attemptNumber - b.attemptNumber)
      .map((a) => ({ ...a }));
  }

  // ─── Provider Events (Webhooks) ──────────────────────────────

  async saveProviderEvent(event: PaymentProviderEvent): Promise<void> {
    this.providerEvents.set(event.id, { ...event });
  }

  async getProviderEvent(provider: string, providerEventId: string): Promise<PaymentProviderEvent | undefined> {
    for (const e of this.providerEvents.values()) {
      if (e.provider === provider && e.providerEventId === providerEventId) {
        return { ...e };
      }
    }
    return undefined;
  }

  async updateProviderEvent(id: string, updates: Partial<PaymentProviderEvent>): Promise<void> {
    const existing = this.providerEvents.get(id);
    if (!existing) throw new Error(`ProviderEvent ${id} not found`);
    this.providerEvents.set(id, { ...existing, ...updates });
  }

  // ─── Refunds ─────────────────────────────────────────────────

  async saveRefund(refund: PaymentRefund): Promise<void> {
    this.refunds.set(refund.id, { ...refund });
  }

  async getRefundById(id: string): Promise<PaymentRefund | undefined> {
    const r = this.refunds.get(id);
    return r ? { ...r } : undefined;
  }

  async getRefundByIdempotency(orgId: string, idempotencyKey: string): Promise<PaymentRefund | undefined> {
    for (const r of this.refunds.values()) {
      if (r.organizationId === orgId && r.idempotencyKey === idempotencyKey) {
        return { ...r };
      }
    }
    return undefined;
  }

  async listRefundsForPayment(paymentId: string): Promise<PaymentRefund[]> {
    return Array.from(this.refunds.values())
      .filter((r) => r.paymentId === paymentId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((r) => ({ ...r }));
  }

  async updateRefund(id: string, updates: Partial<PaymentRefund>): Promise<void> {
    const existing = this.refunds.get(id);
    if (!existing) throw new Error(`Refund ${id} not found`);
    this.refunds.set(id, { ...existing, ...updates });
  }

  // ─── Reconciliation ──────────────────────────────────────────

  async listPendingPaymentsForReconciliation(before: Date, limit: number): Promise<Payment[]> {
    return Array.from(this.payments.values())
      .filter((p) => (p.status === "pending" || p.status === "requires_action") && p.createdAt <= before)
      .slice(0, limit)
      .map((p) => ({ ...p }));
  }

  // ─── Transaction ─────────────────────────────────────────────

  async withTransaction<T>(fn: (tx: IPaymentRepository) => Promise<T>): Promise<T> {
    return fn(this);
  }
}
