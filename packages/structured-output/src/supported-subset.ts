export const SUPPORTED_JSON_SCHEMA_KEYWORDS = new Set([
  "type",
  "properties",
  "required",
  "items",
  "enum",
  "const",
  "additionalProperties",
  "minItems",
  "maxItems",
  "minLength",
  "maxLength",
  "minimum",
  "maximum",
  "pattern",
  "format",
  "oneOf",
  "anyOf",
  "description",
  "default",
  "$ref",
  "$defs",
  "nullable",
]);

export const UNSUPPORTED_KEYWORDS = new Set([
  "$id",
  "$schema",
  "$comment",
  "if",
  "then",
  "else",
  "allOf",
  "not",
  "patternProperties",
  "dependentRequired",
  "dependentSchemas",
  "unevaluatedProperties",
  "unevaluatedItems",
  "contains",
  "prefixItems",
  "minContains",
  "maxContains",
  "propertyNames",
  "minProperties",
  "maxProperties",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "uniqueItems",
  "contentEncoding",
  "contentMediaType",
  "contentSchema",
]);

export class UnsupportedSchemaKeywordError extends Error {
  constructor(
    public keyword: string,
    public path: string,
  ) {
    super("Unsupported schema keyword '" + keyword + "' at " + path);
    this.name = "UnsupportedSchemaKeywordError";
  }
}

export function validateSupportedSubset(
  schema: any,
  strict: boolean = true,
  path: string = "",
): string[] {
  const warnings: string[] = [];
  if (typeof schema !== "object" || schema === null) return warnings;

  for (const key of Object.keys(schema)) {
    const currentPath = path ? path + "." + key : key;
    if (UNSUPPORTED_KEYWORDS.has(key)) {
      if (strict) {
        throw new UnsupportedSchemaKeywordError(key, currentPath);
      } else {
        warnings.push("Unsupported keyword '" + key + "' at " + currentPath);
      }
    }
    if (
      typeof schema[key] === "object" &&
      schema[key] !== null &&
      key !== "enum" &&
      key !== "const"
    ) {
      warnings.push(
        ...validateSupportedSubset(schema[key], strict, currentPath),
      );
    }
  }
  return warnings;
}
