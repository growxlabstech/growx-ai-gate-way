import { createHash } from "node:crypto";
import type { CreditNote, Invoice } from "./types.js";

/**
 * Escapes unsafe characters for HTML rendering to prevent XSS/injection.
 */
export function escapeHtml(unsafe: string | null | undefined): string {
  if (unsafe == null) return "";
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export class InvoiceDocumentRenderer {
  public static readonly TEMPLATE_VERSION = "2026.1";

  /**
   * Renders an invoice document to HTML.
   * Uses only immutable snapshot fields.
   */
  static renderHtml(invoice: Invoice): { html: string; sha256Hash: string } {
    const seller = invoice.legalEntitySnapshot;
    const customer = invoice.billingProfileSnapshot;

    const sellerTaxIds = seller.taxIdentifiers
      .map((t) => `${escapeHtml(t.type)}: ${escapeHtml(t.value)}`)
      .join(" | ");

    const customerTaxIds = customer.taxIdentifiers
      .map((t) => `${escapeHtml(t.type)}: ${escapeHtml(t.value)}`)
      .join(" | ");

    const lineRows = invoice.lines
      .map(
        (l) => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${l.lineNumber}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${escapeHtml(l.description)}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${escapeHtml(l.taxCode || "-")}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: right;">${l.quantity}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: right;">${escapeHtml(invoice.currency)} ${l.unitPrice.toFixed(2)}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: right;">${escapeHtml(invoice.currency)} ${l.subtotal.toFixed(2)}</td>
      </tr>`,
      )
      .join("");

    const taxRows = invoice.taxLines
      .map(
        (t) => `
      <tr>
        <td colspan="5" style="padding: 6px 8px; text-align: right; color: #4b5563;">${escapeHtml(t.description)}:</td>
        <td style="padding: 6px 8px; text-align: right;">${escapeHtml(invoice.currency)} ${t.taxAmount.toFixed(2)}</td>
      </tr>`,
      )
      .join("");

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Invoice ${escapeHtml(invoice.invoiceNumber)}</title>
  <style>
    body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #111827; margin: 40px; background: #fff; }
    .header { display: flex; justify-content: space-between; margin-bottom: 30px; }
    .title { font-size: 24px; font-weight: bold; color: #1f2937; }
    .meta { text-align: right; }
    .parties { display: flex; justify-content: space-between; margin-bottom: 30px; }
    .party-box { width: 48%; }
    .party-title { font-weight: bold; margin-bottom: 6px; color: #374151; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
    th { background: #f9fafb; padding: 10px 8px; text-align: left; border-bottom: 2px solid #e5e7eb; }
    .totals { margin-left: auto; width: 40%; }
    .grand-total { font-weight: bold; font-size: 16px; border-top: 2px solid #111827; }
    .status-badge { display: inline-block; padding: 4px 10px; border-radius: 4px; font-weight: bold; text-transform: uppercase; font-size: 12px; background: #e5e7eb; }
    .status-paid { background: #d1fae5; color: #065f46; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="title">${escapeHtml(invoice.invoiceType.toUpperCase())}</div>
      <div style="font-size: 18px; color: #4b5563;">${escapeHtml(invoice.invoiceNumber)}</div>
      <div style="margin-top: 8px;">
        <span class="status-badge ${invoice.status === "paid" ? "status-paid" : ""}">${escapeHtml(invoice.status)}</span>
      </div>
    </div>
    <div class="meta">
      <div><strong>Issue Date:</strong> ${invoice.issueDate.toISOString().slice(0, 10)}</div>
      <div><strong>Due Date:</strong> ${invoice.dueDate.toISOString().slice(0, 10)}</div>
      <div><strong>Currency:</strong> ${escapeHtml(invoice.currency)}</div>
    </div>
  </div>

  <div class="parties">
    <div class="party-box">
      <div class="party-title">From:</div>
      <div><strong>${escapeHtml(seller.legalName)}</strong></div>
      <div>${escapeHtml(seller.registeredAddress.addressLine1)}</div>
      ${seller.registeredAddress.city ? `<div>${escapeHtml(seller.registeredAddress.city)}, ${escapeHtml(seller.registeredAddress.postalCode || "")}</div>` : ""}
      <div>${escapeHtml(seller.country)}</div>
      ${sellerTaxIds ? `<div style="margin-top: 4px; font-size: 13px; color: #4b5563;">${sellerTaxIds}</div>` : ""}
    </div>
    <div class="party-box">
      <div class="party-title">Bill To:</div>
      <div><strong>${escapeHtml(customer.legalName)}</strong></div>
      <div>${escapeHtml(customer.addressLine1)}</div>
      ${customer.city ? `<div>${escapeHtml(customer.city)}, ${escapeHtml(customer.postalCode || "")}</div>` : ""}
      <div>${escapeHtml(customer.country)}</div>
      ${customerTaxIds ? `<div style="margin-top: 4px; font-size: 13px; color: #4b5563;">${customerTaxIds}</div>` : ""}
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width: 5%;">#</th>
        <th style="width: 45%;">Description</th>
        <th style="width: 15%;">SAC / Tax Code</th>
        <th style="width: 10%; text-align: right;">Qty</th>
        <th style="width: 12%; text-align: right;">Unit Price</th>
        <th style="width: 13%; text-align: right;">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${lineRows}
      <tr>
        <td colspan="5" style="padding: 10px 8px; text-align: right; font-weight: 600;">Subtotal:</td>
        <td style="padding: 10px 8px; text-align: right; font-weight: 600;">${escapeHtml(invoice.currency)} ${invoice.subtotal.toFixed(2)}</td>
      </tr>
      ${taxRows}
      <tr class="grand-total">
        <td colspan="5" style="padding: 12px 8px; text-align: right;">Total Amount:</td>
        <td style="padding: 12px 8px; text-align: right;">${escapeHtml(invoice.currency)} ${invoice.total.toFixed(2)}</td>
      </tr>
      <tr>
        <td colspan="5" style="padding: 6px 8px; text-align: right; color: #4b5563;">Amount Paid:</td>
        <td style="padding: 6px 8px; text-align: right;">${escapeHtml(invoice.currency)} ${invoice.amountPaid.toFixed(2)}</td>
      </tr>
      <tr>
        <td colspan="5" style="padding: 6px 8px; text-align: right; font-weight: bold; color: #1f2937;">Amount Due:</td>
        <td style="padding: 6px 8px; text-align: right; font-weight: bold;">${escapeHtml(invoice.currency)} ${invoice.amountDue.toFixed(2)}</td>
      </tr>
    </tbody>
  </table>

  <div style="font-size: 12px; color: #6b7280; text-align: center; margin-top: 40px;">
    Rendered by GrowX AI Gateway Billing Engine (Template v${InvoiceDocumentRenderer.TEMPLATE_VERSION})
  </div>
</body>
</html>`;

    const sha256Hash = createHash("sha256").update(html, "utf8").digest("hex");
    return { html, sha256Hash };
  }

  /**
   * Renders a credit note document to HTML.
   */
  static renderCreditNoteHtml(creditNote: CreditNote): {
    html: string;
    sha256Hash: string;
  } {
    const lineRows = creditNote.lines
      .map(
        (l) => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${l.lineNumber}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${escapeHtml(l.description)}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: right;">${l.quantity}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: right;">${escapeHtml(creditNote.currency)} ${l.unitPrice.toFixed(2)}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: right;">${escapeHtml(creditNote.currency)} ${l.subtotal.toFixed(2)}</td>
      </tr>`,
      )
      .join("");

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Credit Note ${escapeHtml(creditNote.creditNoteNumber)}</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 40px; color: #111827; }
    .title { font-size: 24px; font-weight: bold; color: #b91c1c; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th { background: #fef2f2; padding: 8px; text-align: left; }
  </style>
</head>
<body>
  <div class="title">CREDIT NOTE</div>
  <div><strong>Number:</strong> ${escapeHtml(creditNote.creditNoteNumber)}</div>
  <div><strong>Original Invoice Ref:</strong> ${escapeHtml(creditNote.originalInvoiceId)}</div>
  <div><strong>Date:</strong> ${creditNote.issuedAt.toISOString().slice(0, 10)}</div>
  <div><strong>Reason:</strong> ${escapeHtml(creditNote.reason)}</div>

  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Description</th>
        <th style="text-align: right;">Qty</th>
        <th style="text-align: right;">Unit Price</th>
        <th style="text-align: right;">Subtotal</th>
      </tr>
    </thead>
    <tbody>
      ${lineRows}
      <tr>
        <td colspan="4" style="text-align: right; padding: 10px 8px; font-weight: bold;">Credit Total:</td>
        <td style="text-align: right; padding: 10px 8px; font-weight: bold;">${escapeHtml(creditNote.currency)} ${creditNote.total.toFixed(2)}</td>
      </tr>
    </tbody>
  </table>
</body>
</html>`;

    const sha256Hash = createHash("sha256").update(html, "utf8").digest("hex");
    return { html, sha256Hash };
  }
}
