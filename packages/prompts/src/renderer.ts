import crypto from "node:crypto";
import type {
  PromptMessageTemplate,
  PromptVariableDefinition,
  PromptVersion,
} from "@growx/contracts";
import { PromptRenderError, PromptValidationError } from "./errors.js";

export interface RenderOptions {
  allowExtraVariables?: boolean | undefined;
  maxVariableBytes?: number | undefined;
  maxTotalRenderBytes?: number | undefined;
}

export interface RenderedPromptResult {
  renderedMessages: Array<{ role: string; content: string }>;
  renderedText: string;
  contentHash: string;
  renderedHash: string;
  usedVariables: Record<string, unknown>;
  sensitiveVariableNames: string[];
}

export class PromptTemplateRenderer {
  public static calculateContentHash(
    messages: PromptMessageTemplate[] | undefined,
    template: string | undefined,
    variableSchema: PromptVariableDefinition[],
    outputSchema?: Record<string, unknown> | undefined,
  ): string {
    const canonicalPayload = {
      messages: messages ?? [],
      template: template ?? "",
      variableSchema: [...variableSchema].sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
      outputSchema: outputSchema ?? null,
    };
    const json = JSON.stringify(canonicalPayload);
    return crypto.createHash("sha256").update(json, "utf8").digest("hex");
  }

  public static calculateRenderedHash(
    renderedMessages: Array<{ role: string; content: string }>,
  ): string {
    const json = JSON.stringify(renderedMessages);
    return crypto.createHash("sha256").update(json, "utf8").digest("hex");
  }

  public static validateAndCoerceVariables(
    variableSchema: PromptVariableDefinition[],
    providedVariables: Record<string, unknown>,
    options: RenderOptions = {},
  ): { validated: Record<string, unknown>; sensitiveNames: string[] } {
    const validated: Record<string, unknown> = {};
    const sensitiveNames: string[] = [];
    const maxVarBytes = options.maxVariableBytes ?? 65_536; // 64 KB

    const schemaMap = new Map<string, PromptVariableDefinition>();
    for (const def of variableSchema) {
      schemaMap.set(def.name, def);
      if (def.sensitive) {
        sensitiveNames.push(def.name);
      }
    }

    // 1. Check for extra unrecognized variables
    if (!options.allowExtraVariables) {
      for (const key of Object.keys(providedVariables)) {
        if (!schemaMap.has(key)) {
          throw new PromptValidationError(
            `Unknown prompt variable '${key}'. Not declared in schema`,
            {
              variable: key,
            },
          );
        }
      }
    }

    // 2. Validate declared variables
    for (const [name, def] of schemaMap.entries()) {
      const rawVal =
        providedVariables[name] !== undefined
          ? providedVariables[name]
          : def.defaultValue;

      if (rawVal === undefined || rawVal === null) {
        if (def.required) {
          throw new PromptValidationError(
            `Missing required prompt variable '${name}'`,
            {
              variable: name,
            },
          );
        }
        continue;
      }

      // Type checking and size validation
      switch (def.type) {
        case "string": {
          if (typeof rawVal !== "string") {
            throw new PromptValidationError(
              `Variable '${name}' must be a string, received ${typeof rawVal}`,
              {
                variable: name,
              },
            );
          }
          if (def.maxLength && rawVal.length > def.maxLength) {
            throw new PromptValidationError(
              `Variable '${name}' exceeds maxLength of ${def.maxLength}`,
              {
                variable: name,
              },
            );
          }
          if (def.enum && !def.enum.includes(rawVal)) {
            throw new PromptValidationError(
              `Variable '${name}' value '${rawVal}' is not in allowed enum: ${def.enum.join(", ")}`,
              {
                variable: name,
              },
            );
          }
          if (Buffer.byteLength(rawVal, "utf8") > maxVarBytes) {
            throw new PromptValidationError(
              `Variable '${name}' exceeds maximum allowed size of ${maxVarBytes} bytes`,
              {
                variable: name,
              },
            );
          }
          validated[name] = rawVal;
          break;
        }
        case "number": {
          if (typeof rawVal !== "number" || !Number.isFinite(rawVal)) {
            throw new PromptValidationError(
              `Variable '${name}' must be a finite number`,
              {
                variable: name,
              },
            );
          }
          validated[name] = rawVal;
          break;
        }
        case "boolean": {
          if (typeof rawVal !== "boolean") {
            throw new PromptValidationError(
              `Variable '${name}' must be a boolean`,
              {
                variable: name,
              },
            );
          }
          validated[name] = rawVal;
          break;
        }
        case "array": {
          if (!Array.isArray(rawVal)) {
            throw new PromptValidationError(
              `Variable '${name}' must be an array`,
              {
                variable: name,
              },
            );
          }
          const serialized = JSON.stringify(rawVal);
          if (Buffer.byteLength(serialized, "utf8") > maxVarBytes) {
            throw new PromptValidationError(
              `Variable '${name}' exceeds maximum allowed size of ${maxVarBytes} bytes`,
              {
                variable: name,
              },
            );
          }
          validated[name] = rawVal;
          break;
        }
        case "object": {
          if (
            typeof rawVal !== "object" ||
            rawVal === null ||
            Array.isArray(rawVal)
          ) {
            throw new PromptValidationError(
              `Variable '${name}' must be an object`,
              {
                variable: name,
              },
            );
          }
          const serialized = JSON.stringify(rawVal);
          if (Buffer.byteLength(serialized, "utf8") > maxVarBytes) {
            throw new PromptValidationError(
              `Variable '${name}' exceeds maximum allowed size of ${maxVarBytes} bytes`,
              {
                variable: name,
              },
            );
          }
          validated[name] = rawVal;
          break;
        }
      }
    }

    return { validated, sensitiveNames };
  }

  public static interpolate(
    template: string,
    variables: Record<string, unknown>,
  ): string {
    // Matches {{{var}}} (unescaped) and {{var}}
    return template.replace(
      /{{{?s*([a-zA-Z0-9_]+)s*}?}}/g,
      (_match, varName) => {
        const val = variables[varName];
        if (val === undefined || val === null) {
          return "";
        }
        if (typeof val === "object") {
          return JSON.stringify(val, null, 2);
        }
        return String(val);
      },
    );
  }

  public static render(
    version: PromptVersion,
    providedVariables: Record<string, unknown>,
    options: RenderOptions = {},
  ): RenderedPromptResult {
    const { validated, sensitiveNames } = this.validateAndCoerceVariables(
      version.variableSchema,
      providedVariables,
      options,
    );

    const maxTotalBytes = options.maxTotalRenderBytes ?? 524_288; // 500 KB
    const renderedMessages: Array<{ role: string; content: string }> = [];

    if (version.messages && version.messages.length > 0) {
      for (const msg of version.messages) {
        const renderedContent = this.interpolate(
          msg.contentTemplate,
          validated,
        );
        renderedMessages.push({
          role: msg.role,
          content: renderedContent,
        });
      }
    } else if (version.template) {
      const renderedContent = this.interpolate(version.template, validated);
      renderedMessages.push({
        role: "user",
        content: renderedContent,
      });
    } else {
      throw new PromptRenderError(
        "Prompt version has neither messages nor template content",
      );
    }

    // Check total render size
    const totalSize = renderedMessages.reduce(
      (sum, m) => sum + Buffer.byteLength(m.content, "utf8"),
      0,
    );
    if (totalSize > maxTotalBytes) {
      throw new PromptRenderError(
        `Total rendered prompt size (${totalSize} bytes) exceeds limit of ${maxTotalBytes} bytes`,
        {
          totalSize,
          maxTotalBytes,
        },
      );
    }

    const renderedText = renderedMessages
      .map((m) => `[${m.role}] ${m.content}`)
      .join("\n\n");
    const contentHash =
      version.contentHash ||
      this.calculateContentHash(
        version.messages,
        version.template,
        version.variableSchema,
        version.outputSchema,
      );
    const renderedHash = this.calculateRenderedHash(renderedMessages);

    return {
      renderedMessages,
      renderedText,
      contentHash,
      renderedHash,
      usedVariables: validated,
      sensitiveVariableNames: sensitiveNames,
    };
  }
}
