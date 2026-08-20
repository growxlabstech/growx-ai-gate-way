import type { IncomingMessage } from "node:http";
import type { IRoutingEvents } from "../application/events.js";

export interface PrivilegedAuthContext {
  userId: string;
  capabilities: string[];
  expiresAt: Date;
  ipAddress?: string | undefined;
}

export interface IPrivilegedAuthResolver {
  resolvePrivilegedSession(
    req: IncomingMessage
  ): Promise<PrivilegedAuthContext | null>;
}

export class InMemoryPrivilegedAuthResolver implements IPrivilegedAuthResolver {
  private sessions = new Map<string, PrivilegedAuthContext>();

  constructor(private readonly events?: IRoutingEvents | undefined) {}

  addSession(token: string, context: PrivilegedAuthContext): void {
    this.sessions.set(token, context);
  }

  async resolvePrivilegedSession(
    req: IncomingMessage
  ): Promise<PrivilegedAuthContext | null> {
    const authHeader = req.headers["authorization"];
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      // Reject spoofed x-actor-id without session token
      if (req.headers["x-actor-id"]) {
        await this.events?.emitSecurityEvent("security.privileged.forged_actor_id_attempt", {
          headerActorId: req.headers["x-actor-id"],
          ip: req.socket?.remoteAddress,
        });
      }
      return null;
    }

    const token = authHeader.slice(7).trim();
    const session = this.sessions.get(token);
    if (!session) {
      return null;
    }

    if (session.expiresAt.getTime() < Date.now()) {
      return null;
    }

    return { ...session };
  }

  clear(): void {
    this.sessions.clear();
  }
}
