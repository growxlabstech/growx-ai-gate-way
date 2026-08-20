import { describe, expect, it, beforeEach } from "vitest";
import { Decimal } from "@growx/money";
import { CreditService, InMemoryCreditRepository } from "@growx/credit-service";
import { SubscriptionService, InMemorySubscriptionRepository } from "@growx/subscription-service";
import { PaymentService } from "../src/application/payment-service.js";
import { createPaymentHttpServer } from "../src/transport/http-server.js";
import { InMemoryPaymentRepository } from "../src/infrastructure/in-memory-repository.js";
import { MockPaymentProviderAdapter } from "@growx/payments";

describe("Phase 19 — HTTP Server Endpoints", () => {
  let server: any;
  let paymentService: PaymentService;
  let subscriptionService: SubscriptionService;
  let mockAdapter: MockPaymentProviderAdapter;
  let seededPlan: any;

  beforeEach(async () => {
    const paymentRepo = new InMemoryPaymentRepository();
    const subRepo = new InMemorySubscriptionRepository();
    const creditRepo = new InMemoryCreditRepository();
    const creditService = new CreditService(creditRepo);
    subscriptionService = new SubscriptionService(subRepo, creditService);

    mockAdapter = new MockPaymentProviderAdapter({
      webhookSecret: "whsec_http_secret",
    });

    paymentService = new PaymentService({
      repository: paymentRepo,
      subscriptionService,
      providers: [mockAdapter],
      defaultProvider: "mock",
    });

    const plan = await subscriptionService.createPlan({ slug: "starter-http", displayName: "Starter HTTP" });
    const version = await subscriptionService.createPlanVersion({
      planId: plan.id,
      billingInterval: "monthly",
      basePriceAmount: "29.00",
      creditGrantAmount: "50.00",
    });
    await subscriptionService.activatePlanVersion(version.id);
    seededPlan = plan;

    server = createPaymentHttpServer(paymentService);
  });

  it("handles health check endpoints", async () => {
    await new Promise<void>((resolve, reject) => {
      const req = new (require("node:http").IncomingMessage)({} as any);
      req.url = "/health";
      req.method = "GET";

      const res = {
        writeHead: (status: number, headers: any) => {
          expect(status).toBe(200);
        },
        end: (body: string) => {
          const json = JSON.parse(body);
          expect(json.status).toBe("ok");
          expect(json.service).toBe("payment-service");
          resolve();
        },
      } as any;

      server.emit("request", req, res);
    });
  });
});
