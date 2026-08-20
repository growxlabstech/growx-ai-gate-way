import { generateId } from "@growx/ids";
import { Decimal } from "@growx/money";
import {
  InvoiceDocumentRenderer,
  InvoiceDraftBuilder,
  InvoiceNumberService,
  InMemoryBillingDocumentStorage,
  getFiscalYear,
  type BillingDocumentStorage,
  type CreditNote,
  type CreditNoteLine,
  type Invoice,
  type InvoiceDocument,
  type InvoiceDraft,
  type InvoiceDraftInput,
  type InvoiceLine,
  type InvoicePaymentAllocation,
  type InvoiceStatus,
  type InvoiceTaxLine,
} from "@growx/billing";
import { TaxService, type TaxCalculation } from "@growx/tax-service";
import type { IInvoiceRepository } from "../domain/types.js";

export interface InvoiceServiceOptions {
  repository: IInvoiceRepository;
  taxService: TaxService;
  storage?: BillingDocumentStorage | undefined;
}

export class InvoiceService {
  private readonly repository: IInvoiceRepository;
  private readonly taxService: TaxService;
  private readonly storage: BillingDocumentStorage;

  constructor(options: InvoiceServiceOptions) {
    this.repository = options.repository;
    this.taxService = options.taxService;
    this.storage = options.storage ?? new InMemoryBillingDocumentStorage();
  }

  // ─── Draft Creation & Preview ────────────────────────────────

  createDraft(input: InvoiceDraftInput): InvoiceDraft {
    return InvoiceDraftBuilder.build(input);
  }

  async previewDraft(
    input: InvoiceDraftInput
  ): Promise<{ draft: InvoiceDraft; taxCalculation: TaxCalculation }> {
    const draft = this.createDraft(input);
    const taxCalc = await this.taxService.calculateTax(
      draft.lines.map((l) => ({
        description: l.description,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        subtotal: l.subtotal,
        productTaxCode: l.taxCode,
      })),
      {
        seller: draft.sellerSnapshot,
        customer: draft.customerSnapshot,
        currency: draft.currency,
        taxPointDate: draft.issueDate,
      }
    );

    return { draft, taxCalculation: taxCalc };
  }

  // ─── Invoice Issuance ────────────────────────────────────────

  async issueInvoice(params: {
    draft: InvoiceDraft;
    taxPointDate?: Date | undefined;
    templateVersion?: string | undefined;
  }): Promise<Invoice> {
    const draft = params.draft;
    const issueDate = draft.issueDate;
    const fiscalYear = getFiscalYear(issueDate, 4);

    // 1. Calculate authoritative tax
    const taxCalc = await this.taxService.calculateTax(
      draft.lines.map((l) => ({
        description: l.description,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        subtotal: l.subtotal,
        productTaxCode: l.taxCode,
      })),
      {
        seller: draft.sellerSnapshot,
        customer: draft.customerSnapshot,
        currency: draft.currency,
        taxPointDate: params.taxPointDate ?? issueDate,
      }
    );

    // 2. Concurrency-safe atomic sequence allocation
    const sequence = await this.repository.getNextSequence(
      draft.legalEntityId,
      fiscalYear
    );

    const invoiceNumber = InvoiceNumberService.formatInvoiceNumber({
      prefix: draft.sellerSnapshot.invoicePrefix,
      sequence,
      date: issueDate,
    });

    const invoiceId = generateId("inv");
    const now = new Date();

    const invoiceLines: InvoiceLine[] = draft.lines.map((l, idx) => ({
      id: generateId("invl"),
      invoiceId,
      lineNumber: idx + 1,
      description: l.description,
      quantity: l.quantity,
      unit: l.unit,
      unitPrice: l.unitPrice,
      subtotal: l.subtotal,
      productCode: l.productCode,
      taxCode: l.taxCode,
      servicePeriodStart: l.servicePeriodStart,
      servicePeriodEnd: l.servicePeriodEnd,
      sourceType: l.sourceType,
      sourceId: l.sourceId,
    }));

    const invoiceTaxLines: InvoiceTaxLine[] = taxCalc.lines.map((t, idx) => ({
      id: generateId("invtl"),
      invoiceId,
      lineNumber: idx + 1,
      taxType: t.taxType,
      rate: t.rate,
      taxableAmount: t.taxableAmount,
      taxAmount: t.taxAmount,
      jurisdiction: t.jurisdiction,
      ruleId: t.ruleId,
      description: t.description,
      sacHsnCode: t.sacHsnCode,
    }));

    const invoice: Invoice = {
      id: invoiceId,
      organizationId: draft.organizationId,
      legalEntityId: draft.legalEntityId,
      invoiceNumber,
      invoiceType: draft.invoiceType,
      status: "issued",
      currency: draft.currency,
      issueDate: draft.issueDate,
      dueDate: draft.dueDate,
      servicePeriodStart: draft.servicePeriodStart,
      servicePeriodEnd: draft.servicePeriodEnd,
      subtotal: draft.subtotal,
      taxTotal: taxCalc.taxTotal,
      total: taxCalc.total,
      amountPaid: Decimal.ZERO,
      amountDue: taxCalc.total,
      billingProfileSnapshot: draft.customerSnapshot,
      legalEntitySnapshot: draft.sellerSnapshot,
      taxCalculationVersion: taxCalc.taxVersion,
      lines: invoiceLines,
      taxLines: invoiceTaxLines,
      draftHash: draft.draftHash,
      issuedAt: now,
      createdAt: now,
      updatedAt: now,
    };

    // Persist immutable invoice
    await this.repository.createInvoice(invoice);

    // 3. Render and store document
    const { html, sha256Hash } = InvoiceDocumentRenderer.renderHtml(invoice);
    const storageKey = `invoices/${draft.organizationId}/${invoice.id}.html`;
    const stored = await this.storage.put(storageKey, html, "text/html");

    const doc: InvoiceDocument = {
      id: generateId("invdoc"),
      invoiceId,
      version: 1,
      templateVersion: params.templateVersion ?? InvoiceDocumentRenderer.TEMPLATE_VERSION,
      format: "html",
      storageKey: stored.storageKey,
      sha256Hash,
      byteSize: stored.byteSize,
      status: "generated",
      createdAt: now,
    };

    await this.repository.createInvoiceDocument(doc);

    return invoice;
  }

  // ─── Querying Invoices ───────────────────────────────────────

  async getInvoice(organizationId: string, invoiceId: string): Promise<Invoice | undefined> {
    const invoice = await this.repository.getInvoice(invoiceId);
    if (!invoice || invoice.organizationId !== organizationId) {
      return undefined;
    }
    return invoice;
  }

  async getInvoiceByNumber(invoiceNumber: string): Promise<Invoice | undefined> {
    return this.repository.getInvoiceByNumber(invoiceNumber);
  }

  async listInvoices(
    organizationId: string,
    filters?: { status?: InvoiceStatus }
  ): Promise<Invoice[]> {
    return this.repository.listInvoices(organizationId, filters);
  }

  async getInvoiceDocument(
    organizationId: string,
    invoiceId: string,
    version: number = 1
  ): Promise<{ document: InvoiceDocument; signedUrl: string } | undefined> {
    const invoice = await this.getInvoice(organizationId, invoiceId);
    if (!invoice) return undefined;

    const doc = await this.repository.getInvoiceDocument(invoiceId, version);
    if (!doc) return undefined;

    const signedUrl = await this.storage.getSignedUrl(doc.storageKey);
    return { document: doc, signedUrl };
  }

  // ─── Voiding ─────────────────────────────────────────────────

  async voidInvoice(organizationId: string, invoiceId: string, reason: string): Promise<Invoice> {
    const invoice = await this.getInvoice(organizationId, invoiceId);
    if (!invoice) {
      throw new Error(`Invoice not found for org: ${organizationId}`);
    }

    if (invoice.status === "paid") {
      throw new Error("Cannot void a fully paid invoice. Issue a credit note instead.");
    }

    if (invoice.status === "void") {
      return invoice;
    }

    const updated = await this.repository.updateInvoice(invoiceId, {
      status: "void",
      voidedAt: new Date(),
    });

    return updated;
  }

  // ─── Payment Allocation & Reconciliation ─────────────────────

  async allocatePayment(params: {
    organizationId: string;
    invoiceId: string;
    paymentId: string;
    amount: Decimal;
    currency: string;
    idempotencyKey: string;
  }): Promise<{ allocation: InvoicePaymentAllocation; invoice: Invoice }> {
    // 1. Idempotency Check
    const existing = await this.repository.getPaymentAllocationByIdempotencyKey(
      params.idempotencyKey
    );
    if (existing) {
      const invoice = await this.getInvoice(params.organizationId, existing.invoiceId);
      return { allocation: existing, invoice: invoice! };
    }

    const invoice = await this.getInvoice(params.organizationId, params.invoiceId);
    if (!invoice) {
      throw new Error(`Invoice not found: ${params.invoiceId}`);
    }

    if (invoice.status === "void" || invoice.status === "uncollectible") {
      throw new Error(`Cannot allocate payment to ${invoice.status} invoice`);
    }

    if (invoice.currency !== params.currency) {
      throw new Error(
        `Currency mismatch: Payment is in ${params.currency}, invoice is in ${invoice.currency}`
      );
    }

    // Create allocation
    const allocation: InvoicePaymentAllocation = {
      id: generateId("invpa"),
      invoiceId: invoice.id,
      paymentId: params.paymentId,
      amount: params.amount,
      currency: params.currency,
      allocatedAt: new Date(),
      idempotencyKey: params.idempotencyKey,
    };
    await this.repository.createPaymentAllocation(allocation);

    // Compute updated totals
    const newAmountPaid = invoice.amountPaid.add(params.amount);
    const newAmountDue = Decimal.max(Decimal.ZERO, invoice.total.sub(newAmountPaid));
    const newStatus: InvoiceStatus = newAmountDue.isZero() ? "paid" : "partially_paid";

    const updatedInvoice = await this.repository.updateInvoice(invoice.id, {
      amountPaid: newAmountPaid,
      amountDue: newAmountDue,
      status: newStatus,
    });

    return { allocation, invoice: updatedInvoice };
  }

  // ─── Credit Notes ────────────────────────────────────────────

  async issueCreditNote(params: {
    organizationId: string;
    originalInvoiceId: string;
    reason: string;
    amount?: Decimal | undefined;
  }): Promise<{ creditNote: CreditNote; invoice: Invoice }> {
    const invoice = await this.getInvoice(params.organizationId, params.originalInvoiceId);
    if (!invoice) {
      throw new Error(`Original invoice not found: ${params.originalInvoiceId}`);
    }

    const fiscalYear = getFiscalYear(new Date(), 4);
    const sequence = await this.repository.getNextSequence(
      invoice.legalEntityId,
      fiscalYear
    );

    const creditNoteNumber = InvoiceNumberService.formatCreditNoteNumber({
      prefix: invoice.legalEntitySnapshot.invoicePrefix,
      sequence,
    });

    const creditAmount = params.amount ?? invoice.total;
    const creditNoteId = generateId("cn");
    const now = new Date();

    const line: CreditNoteLine = {
      id: generateId("cnl"),
      creditNoteId,
      lineNumber: 1,
      description: `Adjustment for Invoice ${invoice.invoiceNumber}: ${params.reason}`,
      quantity: 1,
      unitPrice: creditAmount,
      subtotal: creditAmount,
      taxAmount: Decimal.ZERO,
      total: creditAmount,
    };

    const creditNote: CreditNote = {
      id: creditNoteId,
      organizationId: params.organizationId,
      legalEntityId: invoice.legalEntityId,
      creditNoteNumber,
      originalInvoiceId: invoice.id,
      status: "issued",
      currency: invoice.currency,
      subtotal: creditAmount,
      taxTotal: Decimal.ZERO,
      total: creditAmount,
      amountAllocated: creditAmount,
      reason: params.reason,
      lines: [line],
      issuedAt: now,
      createdAt: now,
    };

    await this.repository.createCreditNote(creditNote);

    // Adjust invoice amountDue
    const newAmountDue = Decimal.max(Decimal.ZERO, invoice.amountDue.sub(creditAmount));
    const updatedInvoice = await this.repository.updateInvoice(invoice.id, {
      amountDue: newAmountDue,
      status: newAmountDue.isZero() ? "paid" : invoice.status,
    });

    return { creditNote, invoice: updatedInvoice };
  }

  async listCreditNotes(organizationId: string): Promise<CreditNote[]> {
    return this.repository.listCreditNotes(organizationId);
  }

  async getCreditNote(
    organizationId: string,
    creditNoteId: string
  ): Promise<CreditNote | undefined> {
    const cn = await this.repository.getCreditNote(creditNoteId);
    if (!cn || cn.organizationId !== organizationId) return undefined;
    return cn;
  }
}
