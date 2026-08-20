import { describe, expect, it, beforeAll, afterAll } from "vitest";
import * as http from "node:http";
import type { MachineAuthContext } from "@growx/api-key-service";
import {
  CreditHttpServer,
  CreditService,
  InMemoryCreditRepository,
} from "../src/index.js";

describe("CreditHttpServer", () => {
  let server: CreditHttpServer;
  let repo: InMemoryCreditRepository;
  let service: CreditService;
  const PORT = 3098;
  const BASE_URL = `http://127.0.0.1:${PORT}`;

  beforeAll(async () => {
    repo = new InMemoryCreditRepository();
    service = new CreditService(repo);

    const mockAuth = async (req: http.IncomingMessage): Promise<MachineAuthContext | null> => {
      const authHeader = req.headers.authorization;
      if (authHeader === "Bearer test_key_123") {
        return {
          apiKeyId: "key_1",
          organizationId: "org_http",
          workspaceId: "ws_http",
          environmentId: "env_1",
          environment: "production",
          permissions: ["chat.completions.create"],
          rateLimits: [],
          modelRules: [],
          ipAllowlist: [],
        } as any;
      }
      return null;
    };

    server = new CreditHttpServer(service, repo, mockAuth);
    await server.listen(PORT, "127.0.0.1");
  });

  afterAll(async () => {
    await server.close();
  });

  async function postJson(path: string, body: unknown, headers: Record<string, string> = {}): Promise<{ status: number; data: any }> {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return { status: res.status, data };
  }

  async function getJson(path: string, headers: Record<string, string> = {}): Promise<{ status: number; data: any }> {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: "GET",
      headers,
    });
    const data = await res.json();
    return { status: res.status, data };
  }

  it("responds to /health check", async () => {
    const res = await getJson("/health");
    expect(res.status).toBe(200);
    expect(res.data.status).toBe("ok");
  });

  it("handles grant, pre-authorization, settlement, and balance check via HTTP", async () => {
    // 1. Grant Credits
    const grantRes = await postJson("/internal/wallets/grants", {
      organizationId: "org_http",
      amount: "100.00",
      sourceType: "order",
      sourceId: "ord_100",
    });
    expect(grantRes.status).toBe(201);
    expect(grantRes.data.balance.available).toBe("100");

    // 2. Authorize Billing
    const authRes = await postJson("/internal/billing/authorize", {
      requestId: "req_http_1",
      organizationId: "org_http",
      workspaceId: "ws_http",
      estimatedPrice: "25.00",
    });
    expect(authRes.status).toBe(200);
    expect(authRes.data.authorized).toBe(true);
    expect(authRes.data.reservedAmount).toBe("25");

    const reservationId = authRes.data.reservationId;

    // 3. Settle Billing
    const settleRes = await postJson("/internal/billing/settle", {
      reservationId,
      finalCustomerPrice: "18.00",
    });
    expect(settleRes.status).toBe(200);
    expect(settleRes.data.status).toBe("settled");
    expect(settleRes.data.consumedAmount).toBe("18");
    expect(settleRes.data.releasedAmount).toBe("7");

    // 4. Check Public Wallet API with Auth
    const walletRes = await getJson("/v1/billing/wallet", {
      Authorization: "Bearer test_key_123",
    });
    expect(walletRes.status).toBe(200);
    expect(walletRes.data.balance.total).toBe("82");
    expect(walletRes.data.balance.available).toBe("82");
    expect(walletRes.data.balance.reserved).toBe("0");

    // 5. Check Ledger API
    const ledgerRes = await getJson("/v1/billing/ledger", {
      Authorization: "Bearer test_key_123",
    });
    expect(ledgerRes.status).toBe(200);
    expect(ledgerRes.data.entries.length).toBeGreaterThanOrEqual(3);
  });

  it("returns 402 on insufficient credits", async () => {
    const authRes = await postJson("/internal/billing/authorize", {
      requestId: "req_too_much_http",
      organizationId: "org_http",
      workspaceId: "ws_http",
      estimatedPrice: "5000.00",
    });
    expect(authRes.status).toBe(402);
    expect(authRes.data.authorized).toBe(false);
    expect(authRes.data.decision).toBe("INSUFFICIENT_CREDITS");
  });

  it("returns 401 on unauthenticated public request", async () => {
    const res = await getJson("/v1/billing/wallet");
    expect(res.status).toBe(401);
  });
});
