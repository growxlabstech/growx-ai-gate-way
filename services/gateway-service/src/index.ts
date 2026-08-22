import { createServer, type Server } from "node:http";
import { createDatabase, schema } from "@growx/database";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  ApiKeyService,
  DrizzleApiKeyRepository,
  InMemoryLifecycleEvents,
} from "@growx/api-key-service";
import {
  DrizzleModelRegistryRepository,
  DrizzleModelRegistryEvents,
  ModelRegistryService,
} from "@growx/model-registry-service";
import { AdapterRegistry } from "@growx/provider-sdk";
import {
  DatabaseProviderRepository,
  DrizzleProviderEvents,
  ProviderCredentialCrypto,
  ProviderService,
} from "@growx/provider-service";
import {
  DatabaseRoutingRepository,
  DrizzleRoutingEvents,
  RoutingEngine,
} from "@growx/routing-service";
import { GatewayEngine } from "./application/gateway-engine.js";
import { StreamRegistry } from "./application/shutdown.js";
import { RoutingEngineRouteResolver } from "./domain/route-resolver.js";
import { DatabaseGatewayRepository } from "./infrastructure/database-repository.js";
import { DrizzleGatewayEvents } from "./infrastructure/events.js";
import { createGatewayServer } from "./transport/http-server.js";

export * from "./domain/types.js";
export * from "./domain/openai-translator.js";
export * from "./domain/route-resolver.js";
export * from "./domain/stream-state.js";
export * from "./application/gateway-engine.js";
export * from "./application/resilience-controller.js";
export * from "./application/stream-controller.js";
export * from "./application/shutdown.js";
export * from "./application/repository.js";
export * from "./application/events.js";
export * from "./infrastructure/in-memory-repository.js";
export * from "./infrastructure/database-repository.js";
export * from "./infrastructure/events.js";
export * from "./transport/http-server.js";
export * from "./transport/sse-serializer.js";
export * from "./access.js";
export * from "./execution.js";
export * from "./public-api.js";

export const serviceName = "gateway-service";

export interface GatewayApplication {
  server: Server;
  engine: GatewayEngine;
  streamRegistry: StreamRegistry;
  close: () => Promise<void>;
}

export function createGatewayApplication(options?: {
  databaseUrl?: string;
  maxBodyBytes?: number;
  pepper?: string;
  providerEncryptionKey?: string;
  shutdownGraceMs?: number;
}): GatewayApplication {
  const databaseUrl =
    options?.databaseUrl ??
    process.env.DATABASE_URL ??
    "postgres://postgres:postgres@localhost:5432/growx";

  const { db, close: closeDb } = createDatabase(databaseUrl);
  const dbTyped = db as unknown as PostgresJsDatabase<typeof schema>;

  const apiKeyRepo = new DrizzleApiKeyRepository(dbTyped);
  const apiKeyEvents = new InMemoryLifecycleEvents();
  const apiKeyService = new ApiKeyService(apiKeyRepo, apiKeyEvents, {
    pepper:
      options?.pepper ??
      process.env.API_KEY_PEPPER ??
      "growx-secret-pepper-32-bytes-long-string!!",
  });

  const modelRepo = new DrizzleModelRegistryRepository(dbTyped);
  const modelEvents = new DrizzleModelRegistryEvents(dbTyped);
  const modelRegistry = new ModelRegistryService(modelRepo, modelEvents);

  const providerRepo = new DatabaseProviderRepository(dbTyped);
  const providerEvents = new DrizzleProviderEvents(dbTyped);
  const crypto = new ProviderCredentialCrypto(
    options?.providerEncryptionKey ??
      process.env.PROVIDER_ENCRYPTION_KEY ??
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  );
  const adapterRegistry = new AdapterRegistry();
  const providerService = new ProviderService(
    providerRepo,
    providerEvents,
    crypto,
    adapterRegistry,
  );

  const routingRepo = new DatabaseRoutingRepository(dbTyped);
  const routingEvents = new DrizzleRoutingEvents(dbTyped);
  const routingEngine = new RoutingEngine(
    modelRegistry,
    providerService,
    routingRepo,
    routingEvents,
  );
  const routeResolver = new RoutingEngineRouteResolver(routingEngine);

  const streamRegistry = new StreamRegistry();

  const gatewayRepo = new DatabaseGatewayRepository(dbTyped);
  const gatewayEvents = new DrizzleGatewayEvents(dbTyped);
  const gatewayEngine = new GatewayEngine(
    modelRegistry,
    providerService,
    gatewayRepo,
    gatewayEvents,
    routeResolver,
    streamRegistry,
  );

  const server = createGatewayServer({
    apiKeyService,
    modelRegistry,
    gatewayEngine,
    maxBodyBytes: options?.maxBodyBytes,
  });

  const shutdownGraceMs = options?.shutdownGraceMs ?? 30_000;

  const gracefulShutdown = async () => {
    // 1. Stop accepting new connections
    server.close();

    // 2. Drain active streams with grace period
    await streamRegistry.initiateGracefulShutdown(shutdownGraceMs);

    // 3. Close database
    await closeDb();
  };

  // Wire SIGTERM/SIGINT handlers (production only)
  if (process.env.NODE_ENV !== "test") {
    const handler = () => {
      gracefulShutdown().catch(() => process.exit(1));
    };
    process.once("SIGTERM", handler);
    process.once("SIGINT", handler);
  }

  return {
    server,
    engine: gatewayEngine,
    streamRegistry,
    close: gracefulShutdown,
  };
}

export function createApp(): Server {
  return createServer((request, response) => {
    const status = {
      status: "ok",
      service: serviceName,
      timestamp: new Date().toISOString(),
    };
    if (
      request.url === "/health" ||
      request.url === "/live" ||
      request.url === "/ready"
    ) {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(status));
      return;
    }
    response.writeHead(404, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        error: { code: "NOT_FOUND", message: "Route not found" },
      }),
    );
  });
}

if (process.env.NODE_ENV !== "test" && process.env.AUTO_START !== "false") {
  const port = Number(process.env.PORT ?? 4000);
  try {
    createGatewayApplication().server.listen(port, () => {
      console.log(`Gateway service listening on port ${port}`);
    });
  } catch {
    createApp().listen(port);
  }
}
