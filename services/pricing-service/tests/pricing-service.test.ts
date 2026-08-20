import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { createServer, request as httpRequest, type Server } from "node:http";
import { URL } from "node:url";
import { Decimal } from "@growx/money";
import {
  createHttpHandler,
  InMemoryPricingRepository,
  PricingService,
  PricingWorker,
} from "../src/index.js";

describe("PricingService and HTTP Server", () => {
  let repository: InMemoryPricingRepository;
  let service: PricingService;
  let worker: PricingWorker;
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    repository = new InMemoryPricingRepository();
    service = new PricingService({ repository });
    worker = new PricingWorker(service);

    // Setup initial active provider price schedule for OpenAI gpt-4o
    await service.createProviderSchedule({
      providerId: "openai",
      providerModelId: "gpt-4o",
      canonicalModelId: "gpt-4o",
      region: "global",
      rates: [
        { usageType: "input_tokens", price: "5.00", perUnits: 1_000_000n },
        { usageType: "output_tokens", price: "15.00", perUnits: 1_000_000n },
        { usageType: "cached_input_tokens", price: "2.50", perUnits: 1_000_000n },
      ],
    });

    // Setup global customer policy with fixed rate for gpt-4o
    await service.createCustomerPolicy({
      scopeType: "global",
      pricingModel: "fixed_model_rate",
      cachePricingMode: "discount_percentage",
      cacheDiscountPercentage: "0.50",
      retryOverheadPolicy: "absorbed_by_growx",
      rateSchedules: [
        {
          canonicalModelId: "gpt-4o",
          rates: [
            { usageType: "input_tokens", price: "6.00", perUnits: 1_000_000n },
            { usageType: "output_tokens", price: "18.00", perUnits: 1_000_000n },
          ],
        },
      ],
    });

    await service.initialize();

    const handler = createHttpHandler({
      pricingService: service,
      internalAdminKey: "test_secret_ops_key",
    });

    server = createServer(handler);

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const addr = server.address() as { port: number };
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterEach(async () => {
    if (server) {
      if (typeof (server as any).closeAllConnections === "function") {
        (server as any).closeAllConnections();
      }
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  function apiCall(
    method: string,
    path: string,
    body?: Record<string, unknown> | undefined,
    headers: Record<string, string> = {}
  ): Promise<{ status: number; body: any }> {
    return new Promise((resolve, reject) => {
      const url = new URL(path, baseUrl);
      const req = httpRequest(
        url,
        {
          method,
          headers: {
            "content-type": "application/json",
            ...headers,
          },
        },
        (res) => {
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => {
            try {
              resolve({
                status: res.statusCode ?? 500,
                body: data ? JSON.parse(data) : {},
              });
            } catch {
              resolve({
                status: res.statusCode ?? 500,
                body: {},
              });
            }
          });
        }
      );
      req.on("error", reject);
      if (body) {
        req.write(JSON.stringify(body));
      }
      req.end();
    });
  }

  it("creates and retrieves provider price schedules and customer policies", async () => {
    const schedules = await service.listProviderSchedules({ providerId: "openai" });
    expect(schedules.length).toBe(1);
    expect(schedules[0]?.schedule.providerId).toBe("openai");

    const policies = await service.listCustomerPolicies({ scopeType: "global" });
    expect(policies.length).toBe(1);
    expect(policies[0]?.policy.scopeType).toBe("global");
  });

  it("simulates prices accurately for prospective requests", async () => {
    const sim = await service.simulatePrice({
      canonicalModelId: "gpt-4o",
      providerId: "openai",
      inputTokens: 100_000,
      outputTokens: 50_000,
    });

    expect(sim.estimatedProviderCost.toString()).toBe("1.25");
    expect(sim.estimatedCustomerPrice.toString()).toBe("1.5");
    expect(sim.estimatedGrossProfit.toString()).toBe("0.25");
    expect(sim.costStatus).toBe("exact");
    expect(sim.pricingStatus).toBe("final");
  });

  it("calculates and stores authoritative request pricing", async () => {
    const detail = await service.priceRequest({
      requestId: "req_test_100",
      organizationId: "org_100",
      workspaceId: "ws_100",
      canonicalModelId: "gpt-4o",
      attempts: [
        {
          id: "att_1",
          attemptNumber: 1,
          providerId: "openai",
          providerModelId: "gpt-4o",
          status: "completed",
          usageSource: "provider_reported",
          usage: { inputTokens: 100_000, outputTokens: 50_000 },
        },
      ],
      logicalUsage: {
        inputTokens: 100_000,
        outputTokens: 50_000,
      },
    });

    expect(detail.providerCost.toString()).toBe("1.25");
    expect(detail.customerPrice.toString()).toBe("1.5");
    expect(detail.grossProfit.toString()).toBe("0.25");

    const retrieved = await service.getRequestPricing("req_test_100");
    expect(retrieved).toBeDefined();
    expect(retrieved?.providerCost.toString()).toBe("1.25");
    expect(retrieved?.customerPrice.toString()).toBe("1.5");
  });

  it("processes asynchronous usage.recorded.v1 events through PricingWorker", async () => {
    await worker.handleUsageRecorded({
      requestId: "req_async_200",
      organizationId: "org_200",
      workspaceId: "ws_200",
      canonicalModelId: "gpt-4o",
      attempts: [
        {
          id: "att_1",
          attemptNumber: 1,
          providerId: "openai",
          providerModelId: "gpt-4o",
          status: "completed",
          usageSource: "provider_reported",
          usage: { inputTokens: 200_000, outputTokens: 100_000 },
        },
      ],
      logicalUsage: {
        inputTokens: 200_000,
        outputTokens: 100_000,
      },
    });

    const retrieved = await service.getRequestPricing("req_async_200");
    expect(retrieved).toBeDefined();
    expect(retrieved?.providerCost.toString()).toBe("2.5");
    expect(retrieved?.customerPrice.toString()).toBe("3");
    expect(retrieved?.grossProfit.toString()).toBe("0.5");
  });

  it("handles health check route", async () => {
    const healthRes = await apiCall("GET", "/health");
    expect(healthRes.status).toBe(200);
  });

  it("rejects unauthenticated requests to internal pricing plane", async () => {
    const unauthRes = await apiCall("GET", "/internal/pricing/provider-schedules");
    expect(unauthRes.status).toBe(403);
  });

  it("allows authenticated requests to internal pricing plane", async () => {
    const authRes = await apiCall("GET", "/internal/pricing/provider-schedules", undefined, {
      "x-growx-internal-key": "test_secret_ops_key",
    });
    expect(authRes.status).toBe(200);
    expect(authRes.body.data.length).toBe(1);
  });

  it("simulates price through public endpoint", async () => {
    const simRes = await apiCall("POST", "/v1/pricing/simulate", {
      canonicalModelId: "gpt-4o",
      inputTokens: 1000,
      outputTokens: 500,
    });
    expect(simRes.status).toBe(200);
    expect(simRes.body.data.estimatedCustomerPrice).toBeDefined();
  });
});
