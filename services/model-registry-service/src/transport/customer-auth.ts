import type { IncomingMessage } from "node:http";
import type { MachineAuthContext } from "@growx/contracts";

export interface CustomerAuthResult {
  authenticated: boolean;
  type?: "session" | "api_key" | "anonymous";
  userId?: string;
  organizationId?: string;
  workspaceId?: string;
  apiKeyId?: string;
  machineContext?: MachineAuthContext;
}

export interface ICustomerAuthResolver {
  resolveCustomerAuth(req: IncomingMessage): Promise<CustomerAuthResult>;
}

export class DefaultCustomerAuthResolver implements ICustomerAuthResolver {
  async resolveCustomerAuth(req: IncomingMessage): Promise<CustomerAuthResult> {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return { authenticated: false, type: "anonymous" };
    }

    const parts = authHeader.trim().split(" ");
    if (parts.length === 2 && parts[0]?.toLowerCase() === "bearer") {
      const token = parts[1]!.trim();
      if (token.startsWith("gx_live_") || token.startsWith("gx_test_")) {
        return {
          authenticated: true,
          type: "api_key",
          apiKeyId: "key_mock",
        };
      }
      return {
        authenticated: true,
        type: "session",
        userId: "user_mock",
      };
    }

    return { authenticated: false, type: "anonymous" };
  }
}
