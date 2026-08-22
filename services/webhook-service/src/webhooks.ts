import { validateWebhookUrl } from "@growx/webhooks";
export type WebhookStatus = "active" | "disabled";
export interface WebhookEndpoint {
  id: string;
  organizationId: string;
  workspaceId: string;
  url: string;
  description: string;
  status: WebhookStatus;
  secretEncrypted: string;
  eventTypes: readonly string[];
  createdAt: Date;
  updatedAt: Date;
}
export interface WebhookRepository {
  insert(endpoint: WebhookEndpoint): Promise<void>;
  find(
    organizationId: string,
    workspaceId: string,
    id: string,
  ): Promise<WebhookEndpoint | null>;
}
export class WebhookEndpointService {
  constructor(
    private readonly repository: WebhookRepository,
    private readonly encrypt: (secret: string) => string,
    private readonly randomSecret: () => string,
    private readonly id: () => string,
  ) {}
  async create(
    input: Omit<
      WebhookEndpoint,
      "id" | "status" | "secretEncrypted" | "createdAt" | "updatedAt"
    >,
  ): Promise<{ endpoint: WebhookEndpoint; secret: string }> {
    validateWebhookUrl(input.url);
    const secret = this.randomSecret();
    const now = new Date();
    const endpoint: WebhookEndpoint = {
      ...input,
      id: this.id(),
      status: "active",
      secretEncrypted: this.encrypt(secret),
      createdAt: now,
      updatedAt: now,
    };
    await this.repository.insert(endpoint);
    return { endpoint, secret };
  }
}
