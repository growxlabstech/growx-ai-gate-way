import { describe, expect, it, beforeEach } from "vitest";
import { Decimal } from "@growx/money";
import { TaxService, InMemoryTaxRepository } from "@growx/tax-service";
import { InvoiceService } from "../src/application/invoice-service.js";
import { InMemoryInvoiceRepository } from "../src/infrastructure/in-memory-repository.js";
import { createInvoiceHttpServer } from "../src/transport/http-server.js";

describe("Phase 20 — HTTP Server Endpoints", () => {
  let server: any;
  let invoiceService: InvoiceService;
  let taxService: TaxService;

  beforeEach(() => {
    const taxRepo = new InMemoryTaxRepository();
    taxService = new TaxService(taxRepo);
    const invoiceRepo = new InMemoryInvoiceRepository();
    invoiceService = new InvoiceService({
      repository: invoiceRepo,
      taxService,
    });
    server = createInvoiceHttpServer(invoiceService, taxService);
  });

  it("handles health check endpoint", async () => {
    await new Promise<void>((resolve) => {
      const req = new (require("node:http").IncomingMessage)({} as any);
      req.url = "/health";
      req.method = "GET";

      const res = {
        writeHead: (status: number) => {
          expect(status).toBe(200);
        },
        end: (body: string) => {
          const json = JSON.parse(body);
          expect(json.status).toBe("ok");
          expect(json.service).toBe("invoice-service");
          resolve();
        },
      } as any;

      server.emit("request", req, res);
    });
  });
});
