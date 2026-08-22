import { describe, expect, it, beforeEach } from "vitest";
import { InMemoryWebhookRepository } from "../src/infrastructure/in-memory-repository.js";
import { WebhookEndpointService } from "../src/application/webhook-endpoint-service.js";

describe("Phase 21 — Webhook Endpoint Lifecycle & Health", () => {
  let repository: InMemoryWebhookRepository;
  let endpointService: WebhookEndpointService;

  beforeEach(() => {
    repository = new InMemoryWebhookRepository();
    endpointService = new WebhookEndpointService(repository);
  });

  it("creates a valid HTTPS endpoint with secret one-time reveal", async () => {
    const { endpoint, secret } = await endpointService.createEndpoint({
      organizationId: "org_ep_1",
      url: "https://api.customer.com/webhooks/growx",
      description: "Primary webhook",
      eventTypes: ["payment.*", "invoice.issued.v1"],
    });

    expect(endpoint.id).toBeDefined();
    expect(endpoint.status).toBe("active");
    expect(endpoint.url).toBe("https://api.customer.com/webhooks/growx");
    expect(secret).toMatch(/^whsec_[a-f0-9]{48}$/);

    // Endpoint in DB does NOT store plaintext secret
    const fetched = await endpointService.getEndpoint("org_ep_1", endpoint.id);
    expect(fetched).toBeDefined();
    expect(fetched!.secretEncrypted).not.toBe(secret);
  });

  it("rejects invalid URLs, embedded credentials, and private IPs", async () => {
    // Insecure HTTP
    await expect(
      endpointService.createEndpoint({
        organizationId: "org_ep_1",
        url: "http://api.customer.com/webhooks",
        eventTypes: ["*.*"],
      }),
    ).rejects.toThrow("must use HTTPS");

    // Embedded credentials
    await expect(
      endpointService.createEndpoint({
        organizationId: "org_ep_1",
        url: "https://user:pass@api.customer.com/webhooks",
        eventTypes: ["*.*"],
      }),
    ).rejects.toThrow("embedded user/password");

    // Localhost / private hostname
    await expect(
      endpointService.createEndpoint({
        organizationId: "org_ep_1",
        url: "https://localhost/webhooks",
        eventTypes: ["*.*"],
      }),
    ).rejects.toThrow("forbidden");
  });

  it("rotates signing secret with version increment and overlap window", async () => {
    const { endpoint, secret: initialSecret } =
      await endpointService.createEndpoint({
        organizationId: "org_ep_1",
        url: "https://api.customer.com/webhooks/growx",
        eventTypes: ["*.*"],
      });

    expect(endpoint.secretVersion).toBe(1);

    const { endpoint: rotated, newSecret } = await endpointService.rotateSecret(
      "org_ep_1",
      endpoint.id,
    );

    expect(rotated.secretVersion).toBe(2);
    expect(newSecret).not.toBe(initialSecret);

    const allSecrets = await repository.listSigningSecrets(endpoint.id);
    expect(allSecrets.length).toBe(2);

    const prevSecret = allSecrets.find((s) => s.keyVersion === 1);
    expect(prevSecret?.status).toBe("rotated");
    expect(prevSecret?.expiresAt).toBeDefined();

    const currentSecret = allSecrets.find((s) => s.keyVersion === 2);
    expect(currentSecret?.status).toBe("active");
  });

  it("tracks endpoint consecutive failures and marks failing after 10 failures", async () => {
    const { endpoint } = await endpointService.createEndpoint({
      organizationId: "org_ep_1",
      url: "https://api.customer.com/webhooks/growx",
      eventTypes: ["*.*"],
    });

    for (let i = 1; i <= 9; i++) {
      await endpointService.recordEndpointOutcome(
        "org_ep_1",
        endpoint.id,
        false,
      );
    }
    const after9 = await endpointService.getEndpoint("org_ep_1", endpoint.id);
    expect(after9!.consecutiveFailures).toBe(9);
    expect(after9!.status).toBe("active");

    // 10th failure -> marks failing
    await endpointService.recordEndpointOutcome("org_ep_1", endpoint.id, false);
    const after10 = await endpointService.getEndpoint("org_ep_1", endpoint.id);
    expect(after10!.consecutiveFailures).toBe(10);
    expect(after10!.status).toBe("failing");

    // 1 success resets health
    await endpointService.recordEndpointOutcome("org_ep_1", endpoint.id, true);
    const afterSuccess = await endpointService.getEndpoint(
      "org_ep_1",
      endpoint.id,
    );
    expect(afterSuccess!.consecutiveFailures).toBe(0);
    expect(afterSuccess!.status).toBe("active");
  });
});
