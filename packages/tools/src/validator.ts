import {
  validateSchemaComplexity,
  type SchemaComplexityLimits,
} from "./complexity.js";

export class ToolValidationError extends Error {
  constructor(
    message: string,
    public readonly path: string = "",
  ) {
    super(message);
    this.name = "ToolValidationError";
  }
}

export class JsonSchemaValidator {
  constructor(private readonly limits?: SchemaComplexityLimits) {}

  validateSchemaStructure(schema: unknown): void {
    validateSchemaComplexity(schema, this.limits);
  }

  validateData(
    schema: Record<string, unknown>,
    data: unknown,
    path = "$",
  ): void {
    if (!schema || typeof schema !== "object") return;

    // Type check
    const expectedType = schema.type as string | undefined;
    if (expectedType) {
      this.checkType(expectedType, data, path);
    }

    // Enum check
    if (Array.isArray(schema.enum)) {
      const matched = schema.enum.some(
        (val) => JSON.stringify(val) === JSON.stringify(data),
      );
      if (!matched) {
        throw new ToolValidationError(
          `Value at ${path} is not in enum: [${schema.enum.join(", ")}]`,
          path,
        );
      }
    }

    // String constraints
    if (typeof data === "string") {
      if (
        typeof schema.minLength === "number" &&
        data.length < schema.minLength
      ) {
        throw new ToolValidationError(
          `String at ${path} shorter than minLength ${schema.minLength}`,
          path,
        );
      }
      if (
        typeof schema.maxLength === "number" &&
        data.length > schema.maxLength
      ) {
        throw new ToolValidationError(
          `String at ${path} longer than maxLength ${schema.maxLength}`,
          path,
        );
      }
      if (typeof schema.pattern === "string") {
        const regex = new RegExp(schema.pattern);
        if (!regex.test(data)) {
          throw new ToolValidationError(
            `String at ${path} does not match pattern ${schema.pattern}`,
            path,
          );
        }
      }
    }

    // Number constraints
    if (typeof data === "number") {
      if (typeof schema.minimum === "number" && data < schema.minimum) {
        throw new ToolValidationError(
          `Number at ${path} less than minimum ${schema.minimum}`,
          path,
        );
      }
      if (typeof schema.maximum === "number" && data > schema.maximum) {
        throw new ToolValidationError(
          `Number at ${path} greater than maximum ${schema.maximum}`,
          path,
        );
      }
    }

    // Object constraints
    if (data && typeof data === "object" && !Array.isArray(data)) {
      const obj = data as Record<string, unknown>;
      const required = (schema.required as string[]) ?? [];

      for (const reqKey of required) {
        if (obj[reqKey] === undefined) {
          throw new ToolValidationError(
            `Missing required property '${reqKey}' at ${path}`,
            `${path}.${reqKey}`,
          );
        }
      }

      const properties =
        (schema.properties as Record<string, Record<string, unknown>>) ?? {};
      const additionalProperties = schema.additionalProperties !== false;

      for (const [key, value] of Object.entries(obj)) {
        if (properties[key]) {
          this.validateData(properties[key], value, `${path}.${key}`);
        } else if (!additionalProperties) {
          throw new ToolValidationError(
            `Unknown property '${key}' not allowed at ${path}`,
            `${path}.${key}`,
          );
        }
      }
    }

    // Array constraints
    if (Array.isArray(data)) {
      if (
        typeof schema.minItems === "number" &&
        data.length < schema.minItems
      ) {
        throw new ToolValidationError(
          `Array at ${path} has fewer items than minItems ${schema.minItems}`,
          path,
        );
      }
      if (
        typeof schema.maxItems === "number" &&
        data.length > schema.maxItems
      ) {
        throw new ToolValidationError(
          `Array at ${path} has more items than maxItems ${schema.maxItems}`,
          path,
        );
      }
      if (schema.items && typeof schema.items === "object") {
        for (let i = 0; i < data.length; i++) {
          this.validateData(
            schema.items as Record<string, unknown>,
            data[i],
            `${path}[${i}]`,
          );
        }
      }
    }
  }

  private checkType(expectedType: string, data: unknown, path: string): void {
    if (data === null || data === undefined) {
      if (expectedType !== "null") {
        throw new ToolValidationError(
          `Expected type '${expectedType}', got null/undefined at ${path}`,
          path,
        );
      }
      return;
    }

    switch (expectedType) {
      case "string":
        if (typeof data !== "string")
          throw new ToolValidationError(
            `Expected string at ${path}, got ${typeof data}`,
            path,
          );
        break;
      case "number":
      case "integer":
        if (
          typeof data !== "number" ||
          (expectedType === "integer" && !Number.isInteger(data))
        ) {
          throw new ToolValidationError(
            `Expected ${expectedType} at ${path}, got ${typeof data}`,
            path,
          );
        }
        break;
      case "boolean":
        if (typeof data !== "boolean")
          throw new ToolValidationError(
            `Expected boolean at ${path}, got ${typeof data}`,
            path,
          );
        break;
      case "object":
        if (typeof data !== "object" || Array.isArray(data)) {
          throw new ToolValidationError(
            `Expected object at ${path}, got ${Array.isArray(data) ? "array" : typeof data}`,
            path,
          );
        }
        break;
      case "array":
        if (!Array.isArray(data))
          throw new ToolValidationError(
            `Expected array at ${path}, got ${typeof data}`,
            path,
          );
        break;
      default:
        break;
    }
  }
}
