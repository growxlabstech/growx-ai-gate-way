import { describe, expect, it, beforeEach } from "vitest";
import { InMemoryNotificationRepository } from "../src/infrastructure/in-memory-repository.js";
import { ResendEmailAdapter } from "../src/infrastructure/resend-adapter.js";
import { NotificationDeliveryService } from "../src/application/notification-delivery-service.js";

describe("Phase 23 — In-App Notifications & User Scope Isolation", () => {
  let repository: InMemoryNotificationRepository;
  let deliveryService: NotificationDeliveryService;

  beforeEach(() => {
    repository = new InMemoryNotificationRepository();
    const emailAdapter = new ResendEmailAdapter();
    deliveryService = new NotificationDeliveryService({
      repository,
      emailAdapter,
    });
  });

  it("maintains strict user isolation for in-app notifications", async () => {
    // Notification for User A
    await deliveryService.ingestAndFanout({
      id: "evt_inapp_usr_a",
      type: "credit.low.v1",
      data: {
        remainingCredits: "10.00",
        userId: "usr_A",
      },
    });

    // Notification for User B
    await deliveryService.ingestAndFanout({
      id: "evt_inapp_usr_b",
      type: "credit.low.v1",
      data: {
        remainingCredits: "50.00",
        userId: "usr_B",
      },
    });

    const userANotifs = await repository.listInAppNotifications("usr_A");
    expect(userANotifs.length).toBe(1);
    expect(userANotifs[0]!.body).toContain("10.00");

    const userBNotifs = await repository.listInAppNotifications("usr_B");
    expect(userBNotifs.length).toBe(1);
    expect(userBNotifs[0]!.body).toContain("50.00");

    // User B cannot mark User A's notification as read
    const crossUserRead = await repository.markInAppRead(
      "usr_B",
      userANotifs[0]!.id,
    );
    expect(crossUserRead).toBeUndefined();
  });

  it("supports reading single notification and mark all read", async () => {
    await deliveryService.ingestAndFanout({
      id: "evt_read_1",
      type: "credit.low.v1",
      data: { remainingCredits: "10", userId: "usr_reader" },
    });
    await deliveryService.ingestAndFanout({
      id: "evt_read_2",
      type: "credit.low.v1",
      data: { remainingCredits: "5", userId: "usr_reader" },
    });

    let unread = await repository.listInAppNotifications("usr_reader", {
      unreadOnly: true,
    });
    expect(unread.length).toBe(2);

    // Read single
    await repository.markInAppRead("usr_reader", unread[0]!.id);
    unread = await repository.listInAppNotifications("usr_reader", {
      unreadOnly: true,
    });
    expect(unread.length).toBe(1);

    // Read all
    const marked = await repository.markAllInAppRead("usr_reader");
    expect(marked).toBe(1);

    unread = await repository.listInAppNotifications("usr_reader", {
      unreadOnly: true,
    });
    expect(unread.length).toBe(0);
  });
});
