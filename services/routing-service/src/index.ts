import http from "node:http";
import {
  createRoutingHttpApp,
  type CreateRoutingHttpAppOptions,
} from "./transport/http-routes.js";

export const serviceName = "routing-service";

export * from "./routing.js";
export * from "./domain/signals.js";
export * from "./domain/types.js";
export * from "./application/routing-engine.js";
export * from "./application/routing-state-snapshot-service.js";
export * from "./application/routing-engine-v2.js";
export * from "./application/simulation-service.js";
export * from "./application/policy-management-service.js";
export * from "./application/route-management-service.js";
export * from "./transport/http-routes.js";
export { InMemoryRoutingRepository } from "./infrastructure/in-memory-repository.js";
export { InMemoryRoutingEvents } from "./infrastructure/events.js";
export {
  InMemoryLatencySignalStore,
  InMemoryAvailabilitySignalStore,
} from "./infrastructure/signals.js";

export function createApp(
  options: Partial<CreateRoutingHttpAppOptions>,
): http.Server {
  const handler = createRoutingHttpApp(options as any);
  return http.createServer(handler);
}

export { DatabaseRoutingRepository } from "./infrastructure/database-repository.js";
export { DrizzleRoutingEvents } from "./infrastructure/events.js";
