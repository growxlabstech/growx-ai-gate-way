import type { SchemaFeatureProfile } from "@growx/contracts";

export function analyzeSchemaFeatures(schema: any): SchemaFeatureProfile {
  let depth = 0;
  let propertyCount = 0;
  let requiredCount = 0;
  let usesEnums = false;
  let usesUnions = false;
  let usesPatterns = false;
  let usesAdditionalPropertiesFalse = false;
  let usesNestedArrays = false;
  let usesFormat = false;
  let usesConst = false;
  let arrayNestingDepth = 0;
  let enumValueCount = 0;
  let unionBranchCount = 0;
  let patternLength = 0;

  function traverse(
    node: any,
    currentDepth: number,
    currentArrayDepth: number,
  ) {
    if (typeof node !== "object" || node === null) return;
    depth = Math.max(depth, currentDepth);
    arrayNestingDepth = Math.max(arrayNestingDepth, currentArrayDepth);

    if (node.type === "object" && node.properties) {
      const keys = Object.keys(node.properties);
      propertyCount += keys.length;
      for (const key of keys) {
        traverse(node.properties[key], currentDepth + 1, currentArrayDepth);
      }
    } else if (node.type === "array" && node.items) {
      usesNestedArrays = currentArrayDepth > 0;
      traverse(node.items, currentDepth + 1, currentArrayDepth + 1);
    }

    if (node.required && Array.isArray(node.required)) {
      requiredCount += node.required.length;
    }

    if (node.enum && Array.isArray(node.enum)) {
      usesEnums = true;
      enumValueCount += node.enum.length;
    }
    if (node.anyOf) {
      usesUnions = true;
      unionBranchCount += node.anyOf.length;
      node.anyOf.forEach((n: any) =>
        traverse(n, currentDepth + 1, currentArrayDepth),
      );
    }
    if (node.oneOf) {
      usesUnions = true;
      unionBranchCount += node.oneOf.length;
      node.oneOf.forEach((n: any) =>
        traverse(n, currentDepth + 1, currentArrayDepth),
      );
    }
    if (node.pattern) {
      usesPatterns = true;
      patternLength = Math.max(patternLength, String(node.pattern).length);
    }
    if (node.additionalProperties === false) {
      usesAdditionalPropertiesFalse = true;
    }
    if (node.format) usesFormat = true;
    if (node.const !== undefined) usesConst = true;

    if (node.$defs) {
      for (const key of Object.keys(node.$defs)) {
        traverse(node.$defs[key], currentDepth + 1, currentArrayDepth);
      }
    }
  }

  traverse(schema, 1, 0);

  let complexityBucket: "simple" | "moderate" | "complex" = "complex";
  if (depth <= 3 && propertyCount <= 10) {
    complexityBucket = "simple";
  } else if (depth <= 5 && propertyCount <= 30) {
    complexityBucket = "moderate";
  }

  const schemaStr = JSON.stringify(schema) || "";
  const schemaSizeBytes = Buffer.byteLength(schemaStr, "utf8");

  return {
    depth,
    propertyCount,
    requiredCount,
    usesEnums,
    usesUnions,
    usesPatterns,
    usesAdditionalPropertiesFalse,
    usesNestedArrays,
    usesFormat,
    usesConst,
    arrayNestingDepth,
    enumValueCount,
    unionBranchCount,
    patternLength,
    schemaSizeBytes,
    complexityBucket,
  };
}
