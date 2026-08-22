import { describe, expect, it } from "vitest";
import {
  WebhookEndpointService,
  type WebhookEndpoint,
} from "../src/webhooks.js";
describe("webhook endpoints", () => {
  it("returns a secret once and stores only encrypted material", async () => {
    let stored: WebhookEndpoint | undefined;
    const service = new WebhookEndpointService(
      {
        insert: async (value) => {
          stored = value;
        },
        find: async () => null,
      },
      (value) => `encrypted:${value}`,
      () => "whsec_secret",
      () => "wh_1",
    );
    const result = await service.create({
      organizationId: "org_1",
      workspaceId: "ws_1",
      url: "https://hooks.example.com/events",
      description: "production",
      eventTypes: ["gateway.request.completed"],
    });
    expect(result.secret).toBe("whsec_secret");
    expect(stored?.secretEncrypted).toBe("encrypted:whsec_secret");
  });
});
