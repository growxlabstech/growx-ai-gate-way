import { generateId } from "@growx/ids";
import {
  encryptWebhookSecret,
  generateWebhookSecret,
  resolveAndValidateDns,
  validateWebhookUrl,
  WebhookSerializer,
  type WebhookEndpoint,
  type WebhookSigningSecret,
} from "@growx/webhooks";
import type { IWebhookRepository } from "../domain/types.js";

export class WebhookEndpointService {
  constructor(private readonly repository: IWebhookRepository) {}

  async createEndpoint(params: {
    organizationId: string;
    workspaceId?: string | undefined;
    url: string;
    description?: string | undefined;
    eventTypes: readonly string[];
    allowInsecureHttp?: boolean | undefined;
  }): Promise<{ endpoint: WebhookEndpoint; secret: string }> {
    // 1. Validate URL & SSRF
    const validatedUrl = validateWebhookUrl(params.url, {
      allowInsecureHttp: params.allowInsecureHttp,
    });
    await resolveAndValidateDns(validatedUrl.hostname);

    const endpointId = generateId("whep");
    const secretId = generateId("whs");
    const secret = generateWebhookSecret();
    const encryptedSecret = encryptWebhookSecret(secret);
    const now = new Date();

    // 2. Create Signing Secret record
    const signingSecret: WebhookSigningSecret = {
      id: secretId,
      endpointId,
      encryptedSecret,
      keyVersion: 1,
      status: "active",
      createdAt: now,
    };
    await this.repository.createSigningSecret(signingSecret);

    // 3. Create Webhook Endpoint record
    const endpoint: WebhookEndpoint = {
      id: endpointId,
      organizationId: params.organizationId,
      workspaceId: params.workspaceId,
      url: params.url,
      description: params.description ?? "",
      status: "active",
      secretId,
      secretEncrypted: encryptedSecret,
      secretVersion: 1,
      eventTypes: params.eventTypes.length > 0 ? params.eventTypes : ["*.*"],
      consecutiveFailures: 0,
      createdAt: now,
      updatedAt: now,
    };
    await this.repository.createEndpoint(endpoint);

    // 4. Create Subscriptions
    await this.repository.createSubscriptions(endpointId, endpoint.eventTypes);

    return { endpoint, secret };
  }

  async updateEndpoint(
    organizationId: string,
    id: string,
    params: {
      url?: string | undefined;
      description?: string | undefined;
      eventTypes?: readonly string[] | undefined;
      status?: "active" | "disabled" | undefined;
      allowInsecureHttp?: boolean | undefined;
    },
  ): Promise<WebhookEndpoint> {
    const existing = await this.repository.getEndpoint(organizationId, id);
    if (!existing) {
      throw new Error(`Webhook endpoint not found: ${id}`);
    }

    const updates: Partial<WebhookEndpoint> = {};

    if (params.url && params.url !== existing.url) {
      const validatedUrl = validateWebhookUrl(params.url, {
        allowInsecureHttp: params.allowInsecureHttp,
      });
      await resolveAndValidateDns(validatedUrl.hostname);
      updates.url = params.url;
    }

    if (params.description !== undefined) {
      updates.description = params.description;
    }

    if (params.status !== undefined) {
      updates.status = params.status;
      if (params.status === "disabled") {
        updates.disabledAt = new Date();
      } else {
        updates.disabledAt = undefined;
        updates.consecutiveFailures = 0;
      }
    }

    if (params.eventTypes !== undefined) {
      updates.eventTypes = params.eventTypes;
      await this.repository.createSubscriptions(id, params.eventTypes);
    }

    return this.repository.updateEndpoint(organizationId, id, updates);
  }

  async rotateSecret(
    organizationId: string,
    endpointId: string,
    overlapDurationMs: number = 24 * 60 * 60 * 1000, // 24 hour overlap
  ): Promise<{ endpoint: WebhookEndpoint; newSecret: string }> {
    const existing = await this.repository.getEndpoint(
      organizationId,
      endpointId,
    );
    if (!existing) {
      throw new Error(`Webhook endpoint not found: ${endpointId}`);
    }

    const now = new Date();
    const newSecret = generateWebhookSecret();
    const encryptedSecret = encryptWebhookSecret(newSecret);
    const newVersion = existing.secretVersion + 1;
    const newSecretId = generateId("whs");

    // Expire existing active secrets after overlap window
    const activeSecrets = await this.repository.listSigningSecrets(endpointId);
    for (const sec of activeSecrets) {
      if (sec.status === "active") {
        await this.repository.updateSigningSecret(sec.id, {
          status: "rotated",
          expiresAt: new Date(now.getTime() + overlapDurationMs),
        });
      }
    }

    // Create new secret
    const signingSecret: WebhookSigningSecret = {
      id: newSecretId,
      endpointId,
      encryptedSecret,
      keyVersion: newVersion,
      status: "active",
      createdAt: now,
    };
    await this.repository.createSigningSecret(signingSecret);

    // Update endpoint
    const updated = await this.repository.updateEndpoint(
      organizationId,
      endpointId,
      {
        secretId: newSecretId,
        secretEncrypted: encryptedSecret,
        secretVersion: newVersion,
      },
    );

    return { endpoint: updated, newSecret };
  }

  async disableEndpoint(
    organizationId: string,
    id: string,
  ): Promise<WebhookEndpoint> {
    return this.updateEndpoint(organizationId, id, { status: "disabled" });
  }

  async enableEndpoint(
    organizationId: string,
    id: string,
  ): Promise<WebhookEndpoint> {
    return this.updateEndpoint(organizationId, id, { status: "active" });
  }

  async recordEndpointOutcome(
    organizationId: string,
    id: string,
    success: boolean,
  ): Promise<WebhookEndpoint> {
    const existing = await this.repository.getEndpoint(organizationId, id);
    if (!existing) throw new Error(`Endpoint not found: ${id}`);

    const now = new Date();
    if (success) {
      return this.repository.updateEndpoint(organizationId, id, {
        consecutiveFailures: 0,
        lastSuccessAt: now,
        status: existing.status === "failing" ? "active" : existing.status,
      });
    }

    const newFailures = existing.consecutiveFailures + 1;
    let newStatus = existing.status;
    if (newFailures >= 10 && existing.status === "active") {
      newStatus = "failing"; // Mark failing after 10 consecutive failures
    }

    return this.repository.updateEndpoint(organizationId, id, {
      consecutiveFailures: newFailures,
      lastFailureAt: now,
      status: newStatus,
    });
  }

  async getEndpoint(
    organizationId: string,
    id: string,
  ): Promise<WebhookEndpoint | undefined> {
    return this.repository.getEndpoint(organizationId, id);
  }

  async listEndpoints(
    organizationId: string,
    workspaceId?: string | undefined,
  ): Promise<WebhookEndpoint[]> {
    return this.repository.listEndpoints(organizationId, workspaceId);
  }
}
