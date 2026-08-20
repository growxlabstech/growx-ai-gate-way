import type { ToolExecutionContext } from "@growx/contracts";

export interface ToolExecutor {
  readonly name: string;
  supports(toolName: string): boolean;
  execute(context: ToolExecutionContext, args: Record<string, unknown>): Promise<{
    status: "success" | "error";
    content: string;
    structuredData?: Record<string, unknown>;
  }>;
}

/**
 * Static registry for platform-managed tool executors.
 * Code-based registration only - no dynamic imports from customer input.
 */
export class ToolExecutorRegistry {
  private readonly executors = new Map<string, ToolExecutor>();

  register(executor: ToolExecutor): void {
    this.executors.set(executor.name, executor);
  }

  find(toolName: string): ToolExecutor | undefined {
    for (const executor of this.executors.values()) {
      if (executor.supports(toolName)) {
        return executor;
      }
    }
    return undefined;
  }

  list(): ToolExecutor[] {
    return Array.from(this.executors.values());
  }
}
