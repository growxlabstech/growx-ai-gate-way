export const serviceName = "notification-service";

export * from "@growx/notifications";
export * from "./domain/types.js";
export * from "./infrastructure/in-memory-repository.js";
export * from "./infrastructure/resend-adapter.js";
export * from "./application/notification-event-mapper.js";
export * from "./application/recipient-resolver.js";
export * from "./application/preference-resolver.js";
export * from "./application/notification-delivery-service.js";
export * from "./application/escalation-service.js";
export * from "./transport/http-server.js";
