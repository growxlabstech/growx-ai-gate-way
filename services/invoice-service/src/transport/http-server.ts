import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { Decimal } from "@growx/money";
import type { InvoiceService } from "../application/invoice-service.js";
import type { TaxService } from "@growx/tax-service";

export function createInvoiceHttpServer(
  invoiceService: InvoiceService,
  taxService: TaxService
) {
  return createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const pathname = url.pathname;
    const method = req.method ?? "GET";

    const sendJson = (statusCode: number, data: any) => {
      res.writeHead(statusCode, { "Content-Type": "application/json" });
      res.end(JSON.stringify(data));
    };

    const parseBody = async (): Promise<any> => {
      return new Promise((resolve, reject) => {
        let body = "";
        req.on("data", (chunk) => (body += chunk));
        req.on("end", () => {
          try {
            resolve(body ? JSON.parse(body) : {});
          } catch (err) {
            reject(err);
          }
        });
      });
    };

    try {
      // ─── Health ────────────────────────────────────────────────
      if (method === "GET" && pathname === "/health") {
        return sendJson(200, { status: "ok", service: "invoice-service" });
      }

      // ─── Customer Billing Profile ──────────────────────────────
      if (pathname === "/v1/billing/profile") {
        const orgId = req.headers["x-organization-id"] as string;
        if (!orgId) return sendJson(401, { error: "Missing organization context" });

        if (method === "GET") {
          const profile = await taxService.getBillingProfile(orgId);
          return sendJson(200, { profile });
        }

        if (method === "PUT" || method === "PATCH") {
          const body = await parseBody();
          const profile = await taxService.upsertBillingProfile(orgId, body);
          return sendJson(200, { profile });
        }
      }

      // ─── Customer Invoices ──────────────────────────────────────
      if (pathname === "/v1/billing/invoices" && method === "GET") {
        const orgId = req.headers["x-organization-id"] as string;
        if (!orgId) return sendJson(401, { error: "Missing organization context" });

        const invoices = await invoiceService.listInvoices(orgId);
        return sendJson(200, { invoices });
      }

      const invoiceMatch = pathname.match(/^\/v1\/billing\/invoices\/([^/]+)$/);
      if (invoiceMatch && method === "GET") {
        const orgId = req.headers["x-organization-id"] as string;
        if (!orgId) return sendJson(401, { error: "Missing organization context" });

        const invoiceId = invoiceMatch[1];
        const invoice = await invoiceService.getInvoice(orgId, invoiceId);
        if (!invoice) return sendJson(404, { error: "Invoice not found" });
        return sendJson(200, { invoice });
      }

      const docMatch = pathname.match(/^\/v1\/billing\/invoices\/([^/]+)\/document$/);
      if (docMatch && method === "GET") {
        const orgId = req.headers["x-organization-id"] as string;
        if (!orgId) return sendJson(401, { error: "Missing organization context" });

        const invoiceId = docMatch[1];
        const result = await invoiceService.getInvoiceDocument(orgId, invoiceId);
        if (!result) return sendJson(404, { error: "Invoice document not found" });
        return sendJson(200, result);
      }

      // ─── Customer Credit Notes ─────────────────────────────────
      if (pathname === "/v1/billing/credit-notes" && method === "GET") {
        const orgId = req.headers["x-organization-id"] as string;
        if (!orgId) return sendJson(401, { error: "Missing organization context" });

        const creditNotes = await invoiceService.listCreditNotes(orgId);
        return sendJson(200, { creditNotes });
      }

      const cnMatch = pathname.match(/^\/v1\/billing\/credit-notes\/([^/]+)$/);
      if (cnMatch && method === "GET") {
        const orgId = req.headers["x-organization-id"] as string;
        if (!orgId) return sendJson(401, { error: "Missing organization context" });

        const cnId = cnMatch[1];
        const creditNote = await invoiceService.getCreditNote(orgId, cnId);
        if (!creditNote) return sendJson(404, { error: "Credit note not found" });
        return sendJson(200, { creditNote });
      }

      // ─── Internal Privileged APIs ──────────────────────────────
      if (pathname === "/internal/invoices/issue" && method === "POST") {
        const body = await parseBody();
        const draft = invoiceService.createDraft({
          ...body,
          lines: body.lines.map((l: any) => ({
            ...l,
            unitPrice: Decimal.from(l.unitPrice),
          })),
        });
        const invoice = await invoiceService.issueInvoice({ draft });
        return sendJson(201, { invoice });
      }

      const voidMatch = pathname.match(/^\/internal\/invoices\/([^/]+)\/void$/);
      if (voidMatch && method === "POST") {
        const body = await parseBody();
        const invoiceId = voidMatch[1];
        const invoice = await invoiceService.voidInvoice(
          body.organizationId,
          invoiceId,
          body.reason
        );
        return sendJson(200, { invoice });
      }

      const internalCnMatch = pathname.match(/^\/internal\/invoices\/([^/]+)\/credit-note$/);
      if (internalCnMatch && method === "POST") {
        const body = await parseBody();
        const invoiceId = internalCnMatch[1];
        const result = await invoiceService.issueCreditNote({
          organizationId: body.organizationId,
          originalInvoiceId: invoiceId,
          reason: body.reason,
          amount: body.amount ? Decimal.from(body.amount) : undefined,
        });
        return sendJson(201, result);
      }

      return sendJson(404, { error: "Route not found" });
    } catch (err: any) {
      return sendJson(500, { error: err.message ?? "Internal Server Error" });
    }
  });
}
