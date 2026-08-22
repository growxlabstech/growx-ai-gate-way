import { StructuredOutputValidator } from "./validator.js";

export class StructuredStreamBuffer {
  private chunks: string[] = [];
  private currentBytes = 0;
  private readonly maxBufferBytes: number;

  constructor(maxBufferBytes: number = 1024 * 1024) {
    this.maxBufferBytes = maxBufferBytes;
  }

  append(chunk: string): void {
    const bytes = Buffer.byteLength(chunk, "utf8");
    if (this.currentBytes + bytes > this.maxBufferBytes) {
      throw new Error("Stream buffer exceeded maximum size");
    }
    this.chunks.push(chunk);
    this.currentBytes += bytes;
  }

  getAccumulated(): string {
    return this.chunks.join("");
  }

  isComplete(): boolean {
    const data = this.getAccumulated().trim();
    if (!data.startsWith("{") && !data.startsWith("[")) return false;

    let openBraces = 0;
    let openBrackets = 0;
    let inString = false;
    let escape = false;

    for (let i = 0; i < data.length; i++) {
      const char = data[i];
      if (escape) {
        escape = false;
        continue;
      }
      if (char === "\\") {
        escape = true;
        continue;
      }
      if (char === '"') {
        inString = !inString;
        continue;
      }
      if (!inString) {
        if (char === "{") openBraces++;
        if (char === "}") openBraces--;
        if (char === "[") openBrackets++;
        if (char === "]") openBrackets--;
      }
    }
    return openBraces === 0 && openBrackets === 0;
  }

  validate(validator: StructuredOutputValidator, schema: any): any {
    if (!this.isComplete()) {
      return { valid: false, failureCategory: "truncated" };
    }
    return validator.parseAndValidate(this.getAccumulated(), schema);
  }
}
