import type {
  PromptMessageTemplate,
  PromptVariableDefinition,
} from "@growx/contracts";

export interface PromptLintIssue {
  severity: "error" | "warning";
  code: string;
  message: string;
  variable?: string | undefined;
  role?: string | undefined;
}

export class PromptLinter {
  public static extractVariables(template: string): string[] {
    const vars: string[] = [];
    const regex = /{{{?s*([a-zA-Z0-9_]+)s*}?}}/g;
    let match;
    while ((match = regex.exec(template)) !== null) {
      if (match[1] && !vars.includes(match[1])) {
        vars.push(match[1]);
      }
    }
    return vars;
  }

  public static lint(
    messages: PromptMessageTemplate[] | undefined,
    template: string | undefined,
    variableSchema: PromptVariableDefinition[],
  ): PromptLintIssue[] {
    const issues: PromptLintIssue[] = [];

    // 1. Collect all template texts
    const templates: Array<{ role?: string; text: string }> = [];
    if (messages && messages.length > 0) {
      for (const m of messages) {
        templates.push({ role: m.role, text: m.contentTemplate });
      }
    } else if (template) {
      templates.push({ role: "user", text: template });
    } else {
      issues.push({
        severity: "error",
        code: "EMPTY_TEMPLATE",
        message:
          "Prompt version must provide either messages or template content",
      });
      return issues;
    }

    // 2. Extract referenced variables
    const referencedVars = new Set<string>();
    for (const t of templates) {
      for (const v of this.extractVariables(t.text)) {
        referencedVars.add(v);
      }
    }

    // 3. Schema variable map & duplicates
    const schemaVars = new Map<string, PromptVariableDefinition>();
    for (const def of variableSchema) {
      if (schemaVars.has(def.name)) {
        issues.push({
          severity: "error",
          code: "DUPLICATE_VARIABLE",
          message: `Variable '${def.name}' is declared multiple times in schema`,
          variable: def.name,
        });
      }
      schemaVars.set(def.name, def);
    }

    // 4. Undefined variables in template
    for (const ref of referencedVars) {
      if (!schemaVars.has(ref)) {
        issues.push({
          severity: "error",
          code: "UNDEFINED_VARIABLE",
          message: `Template references variable '${ref}' which is not defined in variableSchema`,
          variable: ref,
        });
      }
    }

    // 5. Unused required variables in schema
    for (const [name, def] of schemaVars.entries()) {
      if (
        !referencedVars.has(name) &&
        def.required &&
        def.defaultValue === undefined
      ) {
        issues.push({
          severity: "warning",
          code: "UNUSED_REQUIRED_VARIABLE",
          message: `Variable '${name}' is required in schema but not referenced in template`,
          variable: name,
        });
      }
    }

    // 6. Role ordering validation (system/developer messages should appear before user/assistant)
    if (messages && messages.length > 1) {
      let seenUserOrAssistant = false;
      for (const m of messages) {
        if (m.role === "user" || m.role === "assistant") {
          seenUserOrAssistant = true;
        } else if (
          (m.role === "system" || m.role === "developer") &&
          seenUserOrAssistant
        ) {
          issues.push({
            severity: "warning",
            code: "SYSTEM_MESSAGE_AFTER_USER",
            message: `System/developer message appears after user/assistant message`,
            role: m.role,
          });
        }
      }
    }

    return issues;
  }
}
