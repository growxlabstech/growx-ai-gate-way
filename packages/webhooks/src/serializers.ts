import { createHash } from "node:crypto";
import type { WebhookEnvelope } from "./types.js";

export const MAX_PAYLOAD_BYTES = 256 * 1024; // 256 KB limit

export class WebhookSerializer {
  static createEnvelope<T extends Record<string, unknown>>(params: {
    eventId: string;
    eventType: string;
    eventVersion: string;
    organizationId: string;
    workspaceId?: string | undefined;
    data: T;
    createdAt?: Date | undefined;
    livemode?: boolean | undefined;
  }): { envelope: WebhookEnvelope<T>; rawJson: string; payloadHash: string } {
    const envelope: WebhookEnvelope<T> = {
      id: params.eventId,
      type: params.eventType,
      version: params.eventVersion,
      createdAt: (params.createdAt ?? new Date()).toISOString(),
      organizationId: params.organizationId,
      workspaceId: params.workspaceId,
      data: params.data,
      livemode: params.livemode ?? true,
    };

    const rawJson = JSON.stringify(envelope);
    const byteLength = Buffer.byteLength(rawJson, "utf8");

    if (byteLength > MAX_PAYLOAD_BYTES) {
      throw new Error(
        `Webhook payload size (${byteLength} bytes) exceeds maximum limit of ${MAX_PAYLOAD_BYTES} bytes`
      );
    }

    const payloadHash = createHash("sha256").update(rawJson, "utf8").digest("hex");

    return { envelope, rawJson, payloadHash };
  }

  // ─── Typed Redaction Projections ───────────────────────────

  static sanitizeRequestCompleted(eventData: {
    requestId: string;
    workspaceId?: string | undefined;
    model: string;
    status: string;
    usage?: { promptTokens: number; completionTokens: number; totalTokens: number } | undefined;
    latencyMs?: number | undefined;
    clientRequestId?: string | undefined;
  }) {
    return {
      requestId: eventData.requestId,
      workspaceId: eventData.workspaceId,
      model: eventData.model,
      status: eventData.status,
      usage: eventData.usage,
      latencyMs: eventData.latencyMs,
      clientRequestId: eventData.clientRequestId,
    };
  }

  static sanitizePaymentSucceeded(eventData: {
    paymentId: string;
    amount: string | number;
    currency: string;
    status: string;
    paymentMethodType?: string | undefined;
    sourceType?: string | undefined;
    sourceId?: string | undefined;
  }) {
    return {
      paymentId: eventData.paymentId,
      amount: String(eventData.amount),
      currency: eventData.currency.toUpperCase(),
      status: eventData.status,
      paymentMethodType: eventData.paymentMethodType,
      sourceType: eventData.sourceType,
      sourceId: eventData.sourceId,
    };
  }

  static sanitizeInvoiceIssued(eventData: {
    invoiceId: string;
    invoiceNumber: string;
    currency: string;
    subtotal: string | number;
    taxTotal: string | number;
    total: string | number;
    amountDue: string | number;
    issueDate: string | Date;
    dueDate: string | Date;
  }) {
    return {
      invoiceId: eventData.invoiceId,
      invoiceNumber: eventData.invoiceNumber,
      currency: eventData.currency.toUpperCase(),
      subtotal: String(eventData.subtotal),
      taxTotal: String(eventData.taxTotal),
      total: String(eventData.total),
      amountDue: String(eventData.amountDue),
      issueDate: typeof eventData.issueDate === "string" ? eventData.issueDate : eventData.issueDate.toISOString(),
      dueDate: typeof eventData.dueDate === "string" ? eventData.dueDate : eventData.dueDate.toISOString(),
    };
  }

  static sanitizeSubscriptionUpdated(eventData: {
    subscriptionId: string;
    planId: string;
    planVersionId?: string | undefined;
    status: string;
    currentPeriodStart: string | Date;
    currentPeriodEnd: string | Date;
    cancelAtPeriodEnd?: boolean | undefined;
  }) {
    return {
      subscriptionId: eventData.subscriptionId,
      planId: eventData.planId,
      planVersionId: eventData.planVersionId,
      status: eventData.status,
      currentPeriodStart:
        typeof eventData.currentPeriodStart === "string"
          ? eventData.currentPeriodStart
          : eventData.currentPeriodStart.toISOString(),
      currentPeriodEnd:
        typeof eventData.currentPeriodEnd === "string"
          ? eventData.currentPeriodEnd
          : eventData.currentPeriodEnd.toISOString(),
      cancelAtPeriodEnd: eventData.cancelAtPeriodEnd ?? false,
    };
  }

  static sanitizeApiKeyCreated(eventData: {
    apiKeyId: string;
    prefix: string;
    name: string;
    workspaceId?: string | undefined;
    expiresAt?: string | Date | undefined;
  }) {
    return {
      apiKeyId: eventData.apiKeyId,
      prefix: eventData.prefix,
      name: eventData.name,
      workspaceId: eventData.workspaceId,
      expiresAt:
        eventData.expiresAt instanceof Date
          ? eventData.expiresAt.toISOString()
          : eventData.expiresAt,
    };
  }

  static sanitizeCreditLow(eventData: {
    organizationId: string;
    availableCredits: string | number;
    threshold: string | number;
    currency?: string | undefined;
  }) {
    return {
      organizationId: eventData.organizationId,
      availableCredits: String(eventData.availableCredits),
      threshold: String(eventData.threshold),
      currency: (eventData.currency ?? "USD").toUpperCase(),
    };
  }

  static sanitizeTestPing(eventData: {
    pingId: string;
    endpointId: string;
    timestamp: string | Date;
  }) {
    return {
      pingId: eventData.pingId,
      endpointId: eventData.endpointId,
      message: "GrowX Webhook Test Ping — Delivery Verified",
      timestamp:
        typeof eventData.timestamp === "string"
          ? eventData.timestamp
          : eventData.timestamp.toISOString(),
    };
  }
}
