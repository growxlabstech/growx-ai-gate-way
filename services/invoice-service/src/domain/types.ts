import type {
  CreditNote,
  Invoice,
  InvoiceDocument,
  InvoicePaymentAllocation,
  InvoiceStatus,
} from "@growx/billing";

export interface IInvoiceRepository {
  // Sequence allocation
  getNextSequence(legalEntityId: string, fiscalYear: string): Promise<bigint>;

  // Invoices
  createInvoice(invoice: Invoice): Promise<Invoice>;
  getInvoice(id: string): Promise<Invoice | undefined>;
  getInvoiceByNumber(invoiceNumber: string): Promise<Invoice | undefined>;
  listInvoices(organizationId: string, filters?: { status?: InvoiceStatus }): Promise<Invoice[]>;
  updateInvoice(id: string, updates: Partial<Invoice>): Promise<Invoice>;

  // Payment allocations
  createPaymentAllocation(allocation: InvoicePaymentAllocation): Promise<InvoicePaymentAllocation>;
  listPaymentAllocations(invoiceId: string): Promise<InvoicePaymentAllocation[]>;
  getPaymentAllocationByIdempotencyKey(key: string): Promise<InvoicePaymentAllocation | undefined>;

  // Credit notes
  createCreditNote(creditNote: CreditNote): Promise<CreditNote>;
  getCreditNote(id: string): Promise<CreditNote | undefined>;
  listCreditNotes(organizationId: string): Promise<CreditNote[]>;
  updateCreditNote(id: string, updates: Partial<CreditNote>): Promise<CreditNote>;

  // Documents
  createInvoiceDocument(doc: InvoiceDocument): Promise<InvoiceDocument>;
  getInvoiceDocument(invoiceId: string, version?: number): Promise<InvoiceDocument | undefined>;
}
