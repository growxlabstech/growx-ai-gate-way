import type { IncomingMessage } from "node:http";

export interface CustomerAuthContext {
  userId: string;
  organizationId: string;
  workspaceId?: string | undefined;
  permissions: string[];
}

export interface ICustomerAuthResolver {
  resolveCustomerSession(
    req: IncomingMessage,
    workspaceId?: string | undefined
  ): Promise<CustomerAuthContext | null>;
}

export class DefaultCustomerAuthResolver implements ICustomerAuthResolver {
  private contexts = new Map<string, CustomerAuthContext>();

  addContext(token: string, context: CustomerAuthContext): void {
    this.contexts.set(token, context);
  }

  async resolveCustomerSession(
    req: IncomingMessage,
    workspaceId?: string | undefined
  ): Promise<CustomerAuthContext | null> {
    const authHeader = req.headers["authorization"];
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return null;
    }

    const token = authHeader.slice(7).trim();
    const ctx = this.contexts.get(token);
    if (!ctx) {
      return null;
    }

    if (workspaceId && ctx.workspaceId && ctx.workspaceId !== workspaceId) {
      return null;
    }

    return { ...ctx };
  }

  clear(): void {
    this.contexts.clear();
  }
}
