import { createServer, type Server } from "node:http";
import {
  loadEnvironment,
  assertProductionEnvironment,
} from "@growx/configuration";
import { createDatabase, schema } from "@growx/database";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { ApiKeyService } from "./application/api-key-service.js";
import {
  DrizzleApiKeyRepository,
  InMemoryApiKeyRepository,
  type ApiKeyRepository,
} from "./infrastructure/database-repository.js";
import {
  InMemoryLifecycleEvents,
  type LifecycleEvents,
} from "./infrastructure/events.js";
import { createHttpHandler } from "./transport/http-routes.js";
import {
  DrizzleManagementAuthResolver,
  type ManagementAuthResolver,
} from "./transport/management-auth.js";

export const serviceName = "api-key-service";

export * from "./domain/types.js";
export * from "./domain/key-format.js";
export * from "./domain/machine-principal.js";
export * from "./infrastructure/events.js";
export * from "./infrastructure/database-repository.js";
export * from "./application/api-key-service.js";
export * from "./transport/machine-auth-middleware.js";
export * from "./transport/management-auth.js";
export * from "./transport/http-routes.js";

export function createApiKeyApplication(options?: {
  pepper?: string;
  sessionPepper?: string;
  db?: PostgresJsDatabase<typeof schema>;
  repository?: ApiKeyRepository;
  events?: LifecycleEvents;
  managementAuth?: ManagementAuthResolver;
}) {
  const isProduction = process.env.NODE_ENV === "production";

  // Validate explicitly supplied pepper first
  if (options?.pepper !== undefined) {
    if (!options.pepper || Buffer.byteLength(options.pepper) < 32) {
      throw new Error(
        "API_KEY_PEPPER is mandatory and must contain at least 32 bytes",
      );
    }
  }

  let envConfig = null;
  try {
    envConfig = loadEnvironment();
  } catch (err) {
    if (isProduction && !options?.repository && !options?.db) {
      throw new Error(
        `Production configuration failure: ${err instanceof Error ? err.message : "Invalid environment"}`,
      );
    }
  }

  // 1. Resolve API_KEY_PEPPER
  const pepper = options?.pepper ?? envConfig?.API_KEY_PEPPER;
  if (!pepper || Buffer.byteLength(pepper) < 32) {
    if (isProduction || !options) {
      throw new Error(
        "API_KEY_PEPPER is mandatory and must contain at least 32 bytes",
      );
    }
  }
  const effectivePepper =
    pepper ?? "growx-secret-pepper-32-bytes-long-string!!";

  // 2. Resolve Database & Repository
  let repository: ApiKeyRepository;
  let managementAuth: ManagementAuthResolver | undefined =
    options?.managementAuth;

  if (options?.repository) {
    repository = options.repository;
  } else if (options?.db) {
    repository = new DrizzleApiKeyRepository(options.db);
    if (!managementAuth) {
      const sessionPepper =
        options?.sessionPepper ??
        envConfig?.BETTER_AUTH_SECRET ??
        envConfig?.SERVICE_AUTH_SECRET ??
        "growx-session-secret-32-bytes-long!!";
      managementAuth = new DrizzleManagementAuthResolver(
        options.db,
        sessionPepper,
      );
    }
  } else if (envConfig?.DATABASE_URL && !isProduction) {
    try {
      const db = createDatabase(envConfig.DATABASE_URL)
        .db as unknown as PostgresJsDatabase<typeof schema>;
      repository = new DrizzleApiKeyRepository(db);
      if (!managementAuth) {
        const sessionPepper =
          envConfig.BETTER_AUTH_SECRET ?? envConfig.SERVICE_AUTH_SECRET;
        managementAuth = new DrizzleManagementAuthResolver(db, sessionPepper);
      }
    } catch {
      repository = new InMemoryApiKeyRepository();
    }
  } else if (isProduction) {
    throw new Error(
      "Production API Key Service requires a valid database connection (DATABASE_URL)",
    );
  } else {
    repository = new InMemoryApiKeyRepository();
  }

  const events = options?.events ?? new InMemoryLifecycleEvents();

  const service = new ApiKeyService(repository, events, {
    pepper: effectivePepper,
    maxActiveKeysPerWorkspace:
      envConfig?.API_KEY_MAX_ACTIVE_PER_WORKSPACE ?? 50,
    defaultExpiryDays: envConfig?.API_KEY_DEFAULT_EXPIRY_DAYS ?? 365,
    maxExpiryDays: envConfig?.API_KEY_MAX_EXPIRY_DAYS ?? 730,
  });

  const handler = createHttpHandler(service, serviceName, managementAuth);
  return { service, repository, events, managementAuth, handler };
}

export function createApp() {
  const isProduction = process.env.NODE_ENV === "production";
  if (isProduction) {
    const env = loadEnvironment();
    assertProductionEnvironment(env);
    const db = createDatabase(env.DATABASE_URL)
      .db as unknown as PostgresJsDatabase<typeof schema>;
    const app = createApiKeyApplication({
      db,
      pepper: env.API_KEY_PEPPER,
      sessionPepper: env.BETTER_AUTH_SECRET,
    });
    return createServer(app.handler);
  }
  const app = createApiKeyApplication();
  return createServer(app.handler);
}

export function startServer(port = 4004): Server {
  const app = createApp();
  const server = createServer(app);
  server.listen(port);
  return server;
}

if (process.env.NODE_ENV !== "test") {
  const port = Number(process.env.PORT ?? 4004);
  createApp().listen(port);
}
