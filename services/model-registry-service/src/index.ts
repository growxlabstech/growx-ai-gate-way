import { createServer } from "node:http";
import { ModelRegistryService } from "./application/model-registry-service.js";
import { InMemoryModelRegistryRepository } from "./infrastructure/in-memory-repository.js";
import { InMemoryModelRegistryEvents } from "./infrastructure/events.js";
import { InMemoryPrivilegedAuthResolver } from "./transport/privileged-auth.js";
import { DefaultCustomerAuthResolver } from "./transport/customer-auth.js";
import { createModelRegistryHttpApp } from "./transport/http-routes.js";

export * from "./registry.js";

export const serviceName = "model-registry-service";

export function createApp(options?: {
  service?: ModelRegistryService;
  privilegedAuth?: InMemoryPrivilegedAuthResolver;
  customerAuth?: DefaultCustomerAuthResolver;
}) {
  const repository = new InMemoryModelRegistryRepository();
  const events = new InMemoryModelRegistryEvents();
  const service =
    options?.service ?? new ModelRegistryService(repository, events);
  const privilegedAuth =
    options?.privilegedAuth ?? new InMemoryPrivilegedAuthResolver(events);
  const customerAuth =
    options?.customerAuth ?? new DefaultCustomerAuthResolver();

  const handler = createModelRegistryHttpApp({
    service,
    privilegedAuth,
    customerAuth,
  });

  return createServer(handler);
}

if (process.env.NODE_ENV !== "test") {
  const port = Number(process.env.PORT ?? 4000);
  createApp().listen(port, () => {
    // Fail-closed initialization log
  });
}
