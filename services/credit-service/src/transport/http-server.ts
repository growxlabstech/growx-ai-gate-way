import * as http from "node:http";
import type { MachineAuthContext } from "@growx/api-key-service";
import type { CreditService } from "../application/credit-service.js";
import type { ICreditRepository } from "../domain/types.js";

export interface HttpServerConfig {
  port?: number;
  host?: string;
}

export class CreditHttpServer {
  private server: http.Server | null = null;

  constructor(
    private readonly creditService: CreditService,
    private readonly repository: ICreditRepository,
    private readonly authenticate?: (req: http.IncomingMessage) => Promise<MachineAuthContext | null>
  ) {}

  private safeJsonStringify(obj: unknown): string {
    return JSON.stringify(obj, (_key, value) => {
      if (typeof value === "bigint") {
        return value.toString();
      }
      return value;
    });
  }

  private sendJson(res: http.ServerResponse, statusCode: number, data: unknown): void {
    const payload = this.safeJsonStringify(data);
    res.writeHead(statusCode, {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(payload),
    });
    res.end(payload);
  }

  private async parseBody(req: http.IncomingMessage): Promise<any> {
    return new Promise((resolve, reject) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        try {
          resolve(body ? JSON.parse(body) : {});
        } catch (e) {
          reject(e);
        }
      });
      req.on("error", reject);
    });
  }

  async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const pathname = url.pathname;
    const method = req.method ?? "GET";

    try {
      // 1. Health check
      if (pathname === "/health" && method === "GET") {
        return this.sendJson(res, 200, { status: "ok", service: "credit-service" });
      }

      // 2. Public /v1/billing/* routes
      if (pathname.startsWith("/v1/billing/")) {
        if (!this.authenticate) {
          return this.sendJson(res, 401, { error: "Authentication not configured" });
        }
        const auth = await this.authenticate(req);
        if (!auth) {
          return this.sendJson(res, 401, { error: "Unauthorized" });
        }

        if (pathname === "/v1/billing/wallet" && method === "GET") {
          const wallet = await this.creditService.getOrCreateWallet(auth.organizationId);
          const balance = await this.creditService.getWalletBalance(wallet.id);
          return this.sendJson(res, 200, {
            wallet: {
              id: wallet.id,
              organizationId: wallet.organizationId,
              currency: wallet.currency,
              status: wallet.status,
            },
            balance: {
              available: balance.available.toString(),
              reserved: balance.reserved.toString(),
              total: balance.total.toString(),
              version: balance.version,
            },
          });
        }

        if (pathname === "/v1/billing/ledger" && method === "GET") {
          const wallet = await this.creditService.getOrCreateWallet(auth.organizationId);
          const limit = parseInt(url.searchParams.get("limit") ?? "50", 10);
          const entries = await this.repository.listLedgerEntries(wallet.id, limit);
          return this.sendJson(res, 200, {
            entries: entries.map((e) => ({
              id: e.id,
              sequence: e.sequence.toString(),
              entryType: e.entryType,
              amount: e.amount.toString(),
              direction: e.direction,
              referenceType: e.referenceType,
              referenceId: e.referenceId,
              createdAt: e.createdAt.toISOString(),
            })),
          });
        }
      }

      // 3. Internal administrative routes (/internal/*)
      if (pathname.startsWith("/internal/")) {
        if (pathname === "/internal/billing/authorize" && method === "POST") {
          const body = await this.parseBody(req);
          const result = await this.creditService.authorizeBilling(body);
          const status = result.authorized ? 200 : 402;
          return this.sendJson(res, status, {
            authorized: result.authorized,
            decision: result.decision,
            reservationId: result.reservationId,
            estimatedPrice: result.estimatedPrice.toString(),
            reservedAmount: result.reservedAmount.toString(),
            currency: result.currency,
            reason: result.reason,
            availableBalance: result.availableBalance?.toString(),
          });
        }

        if (pathname === "/internal/billing/settle" && method === "POST") {
          const body = await this.parseBody(req);
          const result = await this.creditService.settleReservation(body);
          return this.sendJson(res, 200, {
            status: result.status,
            consumedAmount: result.consumedAmount.toString(),
            releasedAmount: result.releasedAmount.toString(),
            overageAmount: result.overageAmount.toString(),
            shortfallAmount: result.shortfallAmount.toString(),
            reservationId: result.reservation.id,
          });
        }

        if (pathname === "/internal/billing/release" && method === "POST") {
          const body = await this.parseBody(req);
          const result = await this.creditService.releaseReservation(body);
          return this.sendJson(res, 200, {
            reservationId: result.id,
            status: result.status,
            releasedAt: result.releasedAt?.toISOString(),
          });
        }

        if (pathname === "/internal/wallets/grants" && method === "POST") {
          const body = await this.parseBody(req);
          const result = await this.creditService.grantCredits(body);
          return this.sendJson(res, 201, {
            lotId: result.lot.id,
            amount: result.lot.originalAmount.toString(),
            currency: result.lot.currency,
            ledgerEntryId: result.ledgerEntry.id,
            balance: {
              available: result.balance.available.toString(),
              reserved: result.balance.reserved.toString(),
              total: result.balance.total.toString(),
            },
          });
        }

        if (pathname === "/internal/wallets/adjustments" && method === "POST") {
          const body = await this.parseBody(req);
          const result = await this.creditService.applyAdjustment(body);
          return this.sendJson(res, 201, {
            adjustmentId: result.id,
            amount: result.amount.toString(),
            direction: result.direction,
            reason: result.reason,
          });
        }
      }

      return this.sendJson(res, 404, { error: "Not found" });
    } catch (err: any) {
      const statusCode = err.status ?? 500;
      return this.sendJson(res, statusCode, {
        error: err.message ?? "Internal server error",
        code: err.code ?? "INTERNAL_ERROR",
      });
    }
  }

  async listen(port: number = 3006, host: string = "0.0.0.0"): Promise<void> {
    return new Promise((resolve) => {
      this.server = http.createServer((req, res) => this.handleRequest(req, res));
      this.server.listen(port, host, () => {
        resolve();
      });
    });
  }

  async close(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.server) return resolve();
      this.server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}
