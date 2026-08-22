import _Ajv from "ajv";
const Ajv = (_Ajv as any).default || _Ajv;
import _addFormats from "ajv-formats";
const addFormats = (_addFormats as any).default || _addFormats;
import { computeSchemaHash } from "./schema-normalizer.js";

export interface StructuredOutputValidationResult {
  valid: boolean;
  parsedOutput?: unknown;
  errors?: Array<{ path: string; code: string; message: string }>;
  failureCategory?: "invalid_json" | "schema_invalid" | "refusal" | "truncated";
}

export class StructuredOutputValidator {
  private ajv: any;
  private cache = new Map<string, any>();
  private readonly MAX_CACHE_SIZE = 1000;

  constructor() {
    this.ajv = new (Ajv as any)({ strict: false, allErrors: true });
    addFormats(this.ajv);
  }

  public validateSchema(schema: any): boolean {
    return this.ajv.validateSchema(schema);
  }

  public validateOutput(
    schema: any,
    output: any,
    strict: boolean = true,
  ): StructuredOutputValidationResult {
    const hash = computeSchemaHash(schema);
    let validate = this.cache.get(hash);
    if (!validate) {
      if (this.cache.size >= this.MAX_CACHE_SIZE) {
        const firstKey = this.cache.keys().next().value;
        if (firstKey) this.cache.delete(firstKey);
      }
      validate = this.ajv.compile(schema);
      this.cache.set(hash, validate);
    }

    const valid = validate(output);
    if (valid) {
      return { valid: true, parsedOutput: output };
    }

    const errors = validate.errors?.map((err: any) => ({
      path: err.instancePath,
      code: err.keyword,
      message: err.message || "Validation error",
    }));

    return {
      valid: false,
      parsedOutput: output,
      errors,
      failureCategory: "schema_invalid",
    };
  }

  public parseAndValidate(
    rawOutput: string,
    schema: any,
    strict: boolean = true,
  ): StructuredOutputValidationResult {
    let parsed: any;
    try {
      parsed = JSON.parse(rawOutput);
    } catch (e) {
      return { valid: false, failureCategory: "invalid_json" };
    }
    return this.validateOutput(schema, parsed, strict);
  }
}
