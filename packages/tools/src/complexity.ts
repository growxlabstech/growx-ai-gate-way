export interface SchemaComplexityLimits {
  maxDepth: number;
  maxProperties: number;
  maxEnumValues: number;
  maxStringLength: number;
  maxSchemaBytes: number;
}

export const DEFAULT_COMPLEXITY_LIMITS: SchemaComplexityLimits = {
  maxDepth: 8,
  maxProperties: 64,
  maxEnumValues: 128,
  maxStringLength: 32_768,
  maxSchemaBytes: 65_536,
};

export class SchemaComplexityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SchemaComplexityError";
  }
}

export function validateSchemaComplexity(
  schema: unknown,
  limits: SchemaComplexityLimits = DEFAULT_COMPLEXITY_LIMITS
): void {
  const jsonString = JSON.stringify(schema);
  const bytes = Buffer.byteLength(jsonString, "utf8");
  if (bytes > limits.maxSchemaBytes) {
    throw new SchemaComplexityError(`Schema size of ${bytes} bytes exceeds maximum allowed limit of ${limits.maxSchemaBytes} bytes`);
  }

  let totalProperties = 0;

  function traverse(node: unknown, depth: number) {
    if (depth > limits.maxDepth) {
      throw new SchemaComplexityError(`Schema nesting depth ${depth} exceeds maximum limit of ${limits.maxDepth}`);
    }

    if (!node || typeof node !== "object") return;

    if (Array.isArray(node)) {
      for (const item of node) {
        traverse(item, depth + 1);
      }
      return;
    }

    const obj = node as Record<string, unknown>;

    if (obj.enum && Array.isArray(obj.enum)) {
      if (obj.enum.length > limits.maxEnumValues) {
        throw new SchemaComplexityError(`Schema enum value count ${obj.enum.length} exceeds limit of ${limits.maxEnumValues}`);
      }
    }

    if (obj.properties && typeof obj.properties === "object") {
      const propKeys = Object.keys(obj.properties as object);
      totalProperties += propKeys.length;
      if (totalProperties > limits.maxProperties) {
        throw new SchemaComplexityError(`Total properties count ${totalProperties} exceeds limit of ${limits.maxProperties}`);
      }

      for (const key of propKeys) {
        traverse((obj.properties as Record<string, unknown>)[key], depth + 1);
      }
    }

    if (obj.items) {
      traverse(obj.items, depth + 1);
    }
  }

  traverse(schema, 1);
}
