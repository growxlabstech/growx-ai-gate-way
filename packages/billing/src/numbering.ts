/**
 * Calculates standard fiscal year string (e.g. 2026-27 for India fiscal year starting April 1).
 */
export function getFiscalYear(date: Date = new Date(), startMonth = 4): string {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1; // 1-indexed (Jan = 1, April = 4)

  if (startMonth === 4) {
    // April to March fiscal year
    if (month >= 4) {
      const nextYearTwoDigits = (year + 1).toString().slice(-2);
      return `${year}-${nextYearTwoDigits}`;
    } else {
      const yearTwoDigits = year.toString().slice(-2);
      return `${year - 1}-${yearTwoDigits}`;
    }
  }

  // Calendar year
  return year.toString();
}

/**
 * Concurrency-safe invoice and credit note number formatter.
 */
export class InvoiceNumberService {
  /**
   * Formats an invoice number.
   * Format: `${prefix}/${fiscalYear}/${sequenceNumber}` e.g. `GXL/2026-27/000001`
   */
  static formatInvoiceNumber(params: {
    prefix?: string | undefined;
    sequence: number | bigint;
    date?: Date | undefined;
    fiscalYearStartMonth?: number | undefined;
  }): string {
    const prefix = params.prefix?.trim() || "GXL";
    const fiscalYear = getFiscalYear(
      params.date ?? new Date(),
      params.fiscalYearStartMonth ?? 4,
    );
    const seqStr = params.sequence.toString().padStart(6, "0");
    return `${prefix}/${fiscalYear}/${seqStr}`;
  }

  /**
   * Formats a credit note number.
   * Format: `CN-${prefix}/${fiscalYear}/${sequenceNumber}` e.g. `CN-GXL/2026-27/000001`
   */
  static formatCreditNoteNumber(params: {
    prefix?: string | undefined;
    sequence: number | bigint;
    date?: Date | undefined;
    fiscalYearStartMonth?: number | undefined;
  }): string {
    const prefix = params.prefix?.trim() || "GXL";
    const fiscalYear = getFiscalYear(
      params.date ?? new Date(),
      params.fiscalYearStartMonth ?? 4,
    );
    const seqStr = params.sequence.toString().padStart(6, "0");
    return `CN-${prefix}/${fiscalYear}/${seqStr}`;
  }
}
