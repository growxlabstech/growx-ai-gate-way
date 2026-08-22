import type { ToolRegistryService } from "../application/tool-registry.js";

export interface ToolRouteContext {
  organizationId: string;
  workspaceId?: string;
  actorId: string;
}

/**
 * HTTP route handler factories for tool registry management.
 * Wired into the main HTTP server by the application entry point.
 */
export function createToolRouteHandlers(registry: ToolRegistryService) {
  return {
    async createTool(
      ctx: ToolRouteContext,
      body: {
        key: string;
        name: string;
        description?: string;
        executionMode?: "return_to_client" | "platform_managed";
        inputSchema: Record<string, unknown>;
        outputSchema?: Record<string, unknown>;
      },
    ) {
      return registry.createTool({
        ...body,
        organizationId: ctx.organizationId,
        ...(ctx.workspaceId ? { workspaceId: ctx.workspaceId } : {}),
        createdBy: ctx.actorId,
      });
    },

    async getTool(_ctx: ToolRouteContext, toolId: string) {
      return registry.getTool(toolId);
    },

    async listTools(ctx: ToolRouteContext) {
      return registry.listTools(ctx.organizationId);
    },

    async archiveTool(_ctx: ToolRouteContext, toolId: string) {
      return registry.archiveTool(toolId);
    },

    async createVersion(
      ctx: ToolRouteContext,
      toolId: string,
      body: {
        inputSchema: Record<string, unknown>;
        outputSchema?: Record<string, unknown>;
        description?: string;
      },
    ) {
      return registry.createVersion(toolId, {
        ...body,
        createdBy: ctx.actorId,
      });
    },
  };
}
