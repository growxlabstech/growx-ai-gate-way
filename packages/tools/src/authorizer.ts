import type { RegisteredTool, ToolExecutionContext } from "@growx/contracts";

export class ToolAuthorizationError extends Error {
  constructor(message: string, public readonly code: string = "tool_unauthorized") {
    super(message);
    this.name = "ToolAuthorizationError";
  }
}

export interface ToolAuthorizationRules {
  allowedToolNames?: string[];
  deniedToolNames?: string[];
  allowPlatformManaged?: boolean;
}

export class ToolAuthorizationService {
  /**
   * Authorizes execution of a tool for a given caller context.
   */
  authorizeExecution(
    tool: {
      name: string;
      executionMode: "return_to_client" | "platform_managed";
      requiredCapabilities?: string[];
      organizationId?: string;
      workspaceId?: string;
      status?: string;
    },
    context: ToolExecutionContext,
    rules: ToolAuthorizationRules = {}
  ): void {
    // 1. Check Tool Status
    if (tool.status && tool.status !== "active") {
      throw new ToolAuthorizationError(`Tool '${tool.name}' is ${tool.status} and cannot be executed`, "tool_disabled");
    }

    // 2. Multi-tenant Scope Isolation
    if (tool.organizationId && tool.organizationId !== context.organizationId) {
      throw new ToolAuthorizationError(`Tool '${tool.name}' belongs to a different organization`, "tenant_mismatch");
    }
    if (tool.workspaceId && context.workspaceId && tool.workspaceId !== context.workspaceId) {
      throw new ToolAuthorizationError(`Tool '${tool.name}' is restricted to workspace '${tool.workspaceId}'`, "workspace_mismatch");
    }

    // 3. Deny beats Allow
    if (rules.deniedToolNames && rules.deniedToolNames.includes(tool.name)) {
      throw new ToolAuthorizationError(`Policy explicitly denies tool '${tool.name}'`, "policy_denied");
    }

    // 4. Check Allowlist if configured
    if (rules.allowedToolNames && rules.allowedToolNames.length > 0 && !rules.allowedToolNames.includes(tool.name)) {
      throw new ToolAuthorizationError(`Tool '${tool.name}' is not in the allowed tools list`, "tool_not_allowed");
    }

    // 5. Platform-managed execution boundary check
    if (tool.executionMode === "platform_managed" && rules.allowPlatformManaged === false) {
      throw new ToolAuthorizationError(`Platform-managed tool execution is disabled by policy`, "platform_managed_disabled");
    }
  }
}
