import type {
  CreditNote,
  Invoice,
  InvoiceDocument,
  InvoicePaymentAllocation,
  InvoiceStatus,
} from "@growx/billing";
import type { IInvoiceRepository } from "../domain/types.js";

export class InMemoryInvoiceRepository implements IInvoiceRepository {
  public readonly sequences = new Map<string, bigint>(); // key: `${legalEntityId}:${fiscalYear}`
  public readonly invoices = new Map<string, Invoice>();
  public readonly allocations = new Map<string, InvoicePaymentAllocation>();
  public readonly creditNotes = new Map<string, CreditNote>();
  public readonly documents = new Map<string, InvoiceDocument>(); // key: `${invoiceId}:${version}`

  async getNextSequence(legalEntityId: string, fiscalYear: string): Promise<bigint> {
    const key = `${legalEntityId}:${fiscalYear}`;
    const current = this.sequences.get(key) ?? 0n;
    const next = current + 1n;
    this.sequences.set(key, next);
    return next;
  }

  async createInvoice(invoice: Invoice): Promise<Invoice> {
    this.invoices.set(invoice.id, invoice);
    return invoice;
  }

  async getInvoice(id: string): Promise<Invoice | undefined> {
    return this.invoices.get(id);
  }

  async getInvoiceByNumber(invoiceNumber: string): Promise<Invoice | undefined> {
    return Array.from(this.invoices.values()).find((i) => i.invoiceNumber === invoiceNumber);
  }

  async listInvoices(
    organizationId: string,
    filters?: { status?: InvoiceStatus }
  ): Promise<Invoice[]> {
    return Array.from(this.invoices.values())
      .filter((i) => i.organizationId === organizationId)
      .filter((i) => (filters?.status ? i.status === filters.status : true));
  }

  async updateInvoice(id: string, updates: Partial<Invoice>): Promise<Invoice> {
    const existing = this.invoices.get(id);
    if (!existing) throw new Error(`Invoice not found: ${id}`);
    const updated = { ...existing, ...updates, updatedAt: new Date() };
    this.invoices.set(id, updated);
    return updated;
  }

  async createPaymentAllocation(
    allocation: InvoicePaymentAllocation
  ): Promise<InvoicePaymentAllocation> {
    this.allocations.set(allocation.id, allocation);
    return allocation;
  }

  async listPaymentAllocations(invoiceId: string): Promise<InvoicePaymentAllocation[]> {
    return Array.from(this.allocations.values()).filter((a) => a.invoiceId === invoiceId);
  }

  async getPaymentAllocationByIdempotencyKey(
    key: string
  ): Promise<InvoicePaymentAllocation | undefined> {
    return Array.from(this.allocations.values()).find((a) => a.idempotencyKey === key);
  }

  async createCreditNote(creditNote: CreditNote): Promise<CreditNote> {
    this.creditNotes.set(creditNote.id, creditNote);
    return creditNote;
  }

  async getCreditNote(id: string): Promise<CreditNote | undefined> {
    return this.creditNotes.get(id);
  }

  async listCreditNotes(organizationId: string): Promise<CreditNote[]> {
    return Array.from(this.creditNotes.values()).filter(
      (c) => c.organizationId === organizationId
    );
  }

  async updateCreditNote(id: string, updates: Partial<CreditNote>): Promise<CreditNote> {
    const existing = this.creditNotes.get(id);
    if (!existing) throw new Error(`Credit note not found: ${id}`);
    const updated = { ...existing, ...updates };
    this.creditNotes.set(id, updated);
    return updated;
  }

  async createInvoiceDocument(doc: InvoiceDocument): Promise<InvoiceDocument> {
    this.documents.set(`${doc.invoiceId}:${doc.version}`, doc);
    return doc;
  }

  async getInvoiceDocument(
    invoiceId: string,
    version: number = 1
  ): Promise<InvoiceDocument | undefined> {
    return this.documents.get(`${invoiceId}:${version}`);
  }
}
