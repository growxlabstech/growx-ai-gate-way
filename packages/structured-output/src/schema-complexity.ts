import type { StructuredOutputComplexityLimits } from "@growx/contracts";
import { analyzeSchemaFeatures } from "./schema-analyzer.js";

export class SchemaComplexityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SchemaComplexityError";
  }
}

export function validateSchemaComplexity(
  schema: any,
  limits?: StructuredOutputComplexityLimits,
): void {
  const features = analyzeSchemaFeatures(schema);
  const defaultLimits: StructuredOutputComplexityLimits = {
    maxSchemaBytes: 65536,
    maxDepth: 10,
    maxProperties: 100,
    maxRequiredCount: 100,
    maxEnumValues: 200,
    maxArrayNesting: 5,
    maxUnionBranches: 10,
    maxPatternLength: 500,
    maxOutputBytes: 1048576,
  };
  const activeLimits = limits || defaultLimits;

  if (activeLimits.maxDepth && features.depth > activeLimits.maxDepth) {
    throw new SchemaComplexityError(
      "Schema depth " +
        features.depth +
        " exceeds limit " +
        activeLimits.maxDepth,
    );
  }
  if (
    activeLimits.maxProperties &&
    features.propertyCount > activeLimits.maxProperties
  ) {
    throw new SchemaComplexityError(
      "Schema properties count " +
        features.propertyCount +
        " exceeds limit " +
        activeLimits.maxProperties,
    );
  }
}
