import { describe, it, expect } from "vitest";
import { JsonSchemaValidator, ToolValidationError } from "../src/validator.js";
import { SchemaComplexityError } from "../src/complexity.js";

describe("JSON Schema Validator & Complexity Guard", () => {
  const validator = new JsonSchemaValidator();

  it("validates valid object matching schema", () => {
    const schema = {
      type: "object",
      properties: {
        location: { type: "string", minLength: 2 },
        days: { type: "integer", minimum: 1, maximum: 14 },
      },
      required: ["location"],
    };

    expect(() => {
      validator.validateData(schema, { location: "New York", days: 5 });
    }).not.toThrow();
  });

  it("rejects missing required properties", () => {
    const schema = {
      type: "object",
      properties: {
        location: { type: "string" },
      },
      required: ["location"],
    };

    expect(() => {
      validator.validateData(schema, {});
    }).toThrow(ToolValidationError);
  });

  it("rejects unknown properties when additionalProperties is false", () => {
    const schema = {
      type: "object",
      properties: {
        code: { type: "string" },
      },
      additionalProperties: false,
    };

    expect(() => {
      validator.validateData(schema, { code: "123", extra: "forbidden" });
    }).toThrow(ToolValidationError);
  });

  it("enforces schema complexity depth limits", () => {
    const deepSchema = {
      type: "object",
      properties: {
        l1: {
          type: "object",
          properties: {
            l2: {
              type: "object",
              properties: {
                l3: {
                  type: "object",
                  properties: {
                    l4: {
                      type: "object",
                      properties: {
                        l5: {
                          type: "object",
                          properties: {
                            l6: {
                              type: "object",
                              properties: {
                                l7: {
                                  type: "object",
                                  properties: {
                                    l8: {
                                      type: "object",
                                      properties: {
                                        l9: { type: "string" },
                                      },
                                    },
                                  },
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    };

    expect(() => {
      validator.validateSchemaStructure(deepSchema);
    }).toThrow(SchemaComplexityError);
  });
});
