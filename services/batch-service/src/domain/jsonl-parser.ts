import { batchItemRequestSchema, type BatchItemRequest } from "@growx/contracts";
import { BatchValidationError } from "./types.js";

export interface JsonlParserOptions {
  maxLineSizeBytes?: number; // default: 1MB
  maxTotalSizeBytes?: number; // default: 100MB
  maxItemCount?: number; // default: 50,000
}

export interface ParsedBatchInput {
  items: BatchItemRequest[];
  totalBytes: number;
}

export class StreamingJsonlParser {
  private readonly maxLineSizeBytes: number;
  private readonly maxTotalSizeBytes: number;
  private readonly maxItemCount: number;

  constructor(options: JsonlParserOptions = {}) {
    this.maxLineSizeBytes = options.maxLineSizeBytes ?? 1024 * 1024; // 1 MB
    this.maxTotalSizeBytes = options.maxTotalSizeBytes ?? 100 * 1024 * 1024; // 100 MB
    this.maxItemCount = options.maxItemCount ?? 50000;
  }

  /**
   * Parse a full string or buffer containing JSON Lines.
   */
  public parse(content: string | Buffer): ParsedBatchInput {
    const text = typeof content === "string" ? content : content.toString("utf8");
    const totalBytes = Buffer.byteLength(text, "utf8");

    if (totalBytes > this.maxTotalSizeBytes) {
      throw new BatchValidationError(
        `Batch input size exceeds maximum allowed limit of ${this.maxTotalSizeBytes} bytes (got ${totalBytes} bytes)`
      );
    }

    const lines = text.split(/\r?\n/);
    const items: BatchItemRequest[] = [];
    const seenCustomIds = new Set<string>();

    let lineNumber = 0;
    for (const rawLine of lines) {
      lineNumber++;
      const line = rawLine.trim();
      if (!line) {
        continue; // skip blank lines
      }

      const lineByteLength = Buffer.byteLength(line, "utf8");
      if (lineByteLength > this.maxLineSizeBytes) {
        throw new BatchValidationError(
          `Line ${lineNumber} exceeds maximum line size of ${this.maxLineSizeBytes} bytes`
        );
      }

      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(line);
      } catch (err: any) {
        throw new BatchValidationError(`Invalid JSON at line ${lineNumber}: ${err.message}`);
      }

      const validation = batchItemRequestSchema.safeParse(parsedJson);
      if (!validation.success) {
        const issues = validation.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join(", ");
        throw new BatchValidationError(`Validation failed at line ${lineNumber}: ${issues}`);
      }

      const item = validation.data;
      if (seenCustomIds.has(item.custom_id)) {
        throw new BatchValidationError(
          `Duplicate custom_id '${item.custom_id}' found at line ${lineNumber}`
        );
      }

      seenCustomIds.add(item.custom_id);
      items.push(item);

      if (items.length > this.maxItemCount) {
        throw new BatchValidationError(
          `Batch exceeds maximum item count of ${this.maxItemCount} items`
        );
      }
    }

    if (items.length === 0) {
      throw new BatchValidationError("Batch input contains 0 valid request items");
    }

    return { items, totalBytes };
  }

  /**
   * Serialize output records to JSONL string
   */
  public serialize(records: unknown[]): string {
    return records.map(r => JSON.stringify(r)).join("\n") + "\n";
  }
}
