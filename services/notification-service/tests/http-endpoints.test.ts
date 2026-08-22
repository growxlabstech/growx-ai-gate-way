import { describe, expect, it, beforeEach, afterEach } from "vitest";
import type { Server } from "node:http";
import { InMemoryNotificationRepository } from "../src/infrastructure/in-memory-repository.js";
import { ResendEmailAdapter } from "../src/infrastructure/resend-adapter.js";
import { NotificationDeliveryService } from "../src/application/notification-delivery-service.js";
import { createNotificationHttpServer } from "../src/transport/http-server.js";

describe("Phase 23 — Notification HTTP Server Endpoints", () => {
  let repository: InMemoryNotificationRepository;
  let deliveryService: NotificationDeliveryService;
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    repository = new InMemoryNotificationRepository();
    const emailAdapter = new ResendEmailAdapter();
    deliveryService = new NotificationDeliveryService({
      repository,
      emailAdapter,
    });
    server = createNotificationHttpServer({ deliveryService, repository });

    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const address = server.address() as any;
        baseUrl = `http://localhost:${address.port}`;
        resolve();
      });
    });
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it("handles health check", async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.status).toBe("ok");
    expect(body.service).toBe("notification-service");
  });

  it("ingests domain event via POST /v1/notifications", async () => {
    const res = await fetch(`${baseUrl}/v1/notifications`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: "evt_http_1",
        type: "auth.otp.v1",
        data: {
          otp: "555666",
          expiresInMinutes: 10,
          recipientEmail: "http_user@example.com",
        },
      }),
    });

    expect(res.status).toBe(202);
    const body: any = await res.json();
    expect(body.data.intentId).toBeDefined();
    expect(body.data.deliveriesCount).toBe(1);
  });

  it("queries in-app notifications and unread count via /v1/notifications", async () => {
    // Seed in-app notification
    await deliveryService.ingestAndFanout({
      id: "evt_inapp_http",
      type: "credit.low.v1",
      data: { remainingCredits: "15", userId: "usr_http_1" },
    });

    const res = await fetch(`${baseUrl}/v1/notifications`, {
      headers: { "x-user-id": "usr_http_1" },
    });
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.notifications.length).toBe(1);

    const countRes = await fetch(`${baseUrl}/v1/notifications/unread-count`, {
      headers: { "x-user-id": "usr_http_1" },
    });
    const countBody: any = await countRes.json();
    expect(countBody.unreadCount).toBe(1);
  });

  it("processes Resend bounce callback and registers suppression", async () => {
    const res = await fetch(
      `${baseUrl}/v1/notifications/provider-callbacks/resend`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "email.bounced",
          data: { to: ["bounced_dest@example.com"] },
        }),
      },
    );

    expect(res.status).toBe(200);
    const suppression = await repository.getSuppression(
      "bounced_dest@example.com",
    );
    expect(suppression).toBeDefined();
    expect(suppression!.reason).toBe("hard_bounce");
  });
});
