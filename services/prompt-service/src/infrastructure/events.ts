import type { IPromptEvents } from "../domain/types.js";

export class InMemoryPromptEvents implements IPromptEvents {
  public promptEvents: Array<{
    action: string;
    payload: Record<string, unknown>;
    requestId?: string | undefined;
  }> = [];
  public securityEvents: Array<{
    action: string;
    payload: Record<string, unknown>;
    requestId?: string | undefined;
  }> = [];

  async emitPromptEvent(
    action: string,
    payload: Record<string, unknown>,
    requestId?: string,
  ): Promise<void> {
    this.promptEvents.push({ action, payload, requestId });
  }

  async emitSecurityEvent(
    action: string,
    payload: Record<string, unknown>,
    requestId?: string,
  ): Promise<void> {
    this.securityEvents.push({ action, payload, requestId });
  }

  clear(): void {
    this.promptEvents = [];
    this.securityEvents = [];
  }
}
