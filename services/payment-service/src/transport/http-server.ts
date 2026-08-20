import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { PaymentService } from "../application/payment-service.js";

export function createPaymentHttpServer(paymentService: PaymentService) {
  return createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const pathname = url.pathname;
    const method = req.method ?? "GET";

    const sendJson = (statusCode: number, data: unknown) => {
      res.writeHead(statusCode, { "content-type": "application/json" });
      res.end(JSON.stringify(data));
    };

    const sendError = (statusCode: number, code: string, message: string) => {
      sendJson(statusCode, { error: { code, message } });
    };

    // Health endpoints
    if (pathname === "/health" || pathname === "/live" || pathname === "/ready") {
      return sendJson(200, {
        status: "ok",
        service: "payment-service",
        timestamp: new Date().toISOString(),
      });
    }

    // Read raw body bytes
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    }
    const rawBody = Buffer.concat(chunks);

    try {
      // ─── Webhook Endpoints ─────────────────────────────────────
      if (method === "POST" && pathname.startsWith("/webhooks/payments/")) {
        const providerName = pathname.replace("/webhooks/payments/", "");
        const signature =
          (req.headers["stripe-signature"] as string) ??
          (req.headers["x-razorpay-signature"] as string) ??
          (req.headers["x-signature"] as string) ??
          (req.headers["signature"] as string) ??
          "";

        const headers: Record<string, string> = {};
        for (const [k, v] of Object.entries(req.headers)) {
          if (typeof v === "string") headers[k.toLowerCase()] = v;
        }

        const result = await paymentService.processWebhook({
          provider: providerName,
          rawPayload: rawBody,
          signature,
          headers,
        });

        if (result.status === "failed") {
          return sendError(400, "INVALID_WEBHOOK", result.error ?? "Webhook processing failed");
        }

        return sendJson(200, { received: true, ...result });
      }

      // ─── Customer Billing Endpoints ───────────────────────────
      if (method === "POST" && pathname === "/v1/billing/checkout/subscription") {
        const body = JSON.parse(rawBody.toString("utf8") || "{}");
        if (!body.organizationId || !body.planId || !body.successReturnUrl || !body.cancelReturnUrl) {
          return sendError(400, "INVALID_ARGUMENT", "Missing required checkout parameters");
        }

        const session = await paymentService.createSubscriptionCheckout({
          organizationId: body.organizationId,
          planId: body.planId,
          planVersionId: body.planVersionId,
          provider: body.provider,
          successReturnUrl: body.successReturnUrl,
          cancelReturnUrl: body.cancelReturnUrl,
          idempotencyKey: body.idempotencyKey ?? `ck_${Date.now()}_${Math.random()}`,
          metadata: body.metadata,
        });

        return sendJson(201, {
          id: session.id,
          checkoutUrl: session.checkoutUrl,
          providerSessionId: session.providerSessionId,
          amount: session.amount.toString(),
          currency: session.currency,
          status: session.status,
          expiresAt: session.expiresAt.toISOString(),
        });
      }

      if (method === "GET" && pathname === "/v1/billing/payments") {
        const orgId = (req.headers["x-organization-id"] as string) ?? url.searchParams.get("organizationId");
        if (!orgId) {
          return sendError(400, "MISSING_ORG", "Organization ID required");
        }
        const limit = Number(url.searchParams.get("limit") ?? "50");
        const list = await paymentService.listPayments(orgId, limit);
        return sendJson(200, {
          data: list.map((p) => ({
            id: p.id,
            amount: p.amount.toString(),
            currency: p.currency,
            status: p.status,
            purpose: p.purpose,
            refundedAmount: p.refundedAmount.toString(),
            createdAt: p.createdAt.toISOString(),
          })),
        });
      }

      if (method === "GET" && pathname.startsWith("/v1/billing/payments/")) {
        const paymentId = pathname.replace("/v1/billing/payments/", "");
        const orgId = (req.headers["x-organization-id"] as string) ?? url.searchParams.get("organizationId");
        if (!orgId) {
          return sendError(400, "MISSING_ORG", "Organization ID required");
        }
        const p = await paymentService.getPayment(orgId, paymentId);
        if (!p) {
          return sendError(404, "NOT_FOUND", "Payment not found");
        }
        return sendJson(200, {
          id: p.id,
          amount: p.amount.toString(),
          currency: p.currency,
          status: p.status,
          purpose: p.purpose,
          refundedAmount: p.refundedAmount.toString(),
          createdAt: p.createdAt.toISOString(),
        });
      }

      // ─── Privileged Internal Endpoints ────────────────────────
      if (method === "POST" && pathname.startsWith("/internal/payments/") && pathname.endsWith("/refund")) {
        const paymentId = pathname.replace("/internal/payments/", "").replace("/refund", "");
        const body = JSON.parse(rawBody.toString("utf8") || "{}");

        if (!body.organizationId || !body.reason || !body.createdBy) {
          return sendError(400, "INVALID_ARGUMENT", "Missing organizationId, reason, or createdBy");
        }

        const refund = await paymentService.refundPayment({
          paymentId,
          organizationId: body.organizationId,
          amount: body.amount ? body.amount : undefined,
          reason: body.reason,
          createdBy: body.createdBy,
          idempotencyKey: body.idempotencyKey ?? `ref_${paymentId}_${Date.now()}`,
        });

        return sendJson(200, {
          id: refund.id,
          paymentId: refund.paymentId,
          amount: refund.amount.toString(),
          currency: refund.currency,
          status: refund.status,
          reason: refund.reason,
          createdAt: refund.createdAt.toISOString(),
        });
      }

      if (method === "POST" && pathname.startsWith("/internal/payments/") && pathname.endsWith("/reconcile")) {
        const paymentId = pathname.replace("/internal/payments/", "").replace("/reconcile", "");
        const reconciled = await paymentService.reconcilePayment(paymentId);
        return sendJson(200, {
          id: reconciled.id,
          status: reconciled.status,
          amount: reconciled.amount.toString(),
          currency: reconciled.currency,
          updatedAt: reconciled.updatedAt.toISOString(),
        });
      }

      return sendError(404, "NOT_FOUND", "Route not found");
    } catch (err: any) {
      return sendError(500, "INTERNAL_ERROR", err?.message ?? "Internal server error");
    }
  });
}
