# Event Contracts

Phase 2 events use the versioned envelope exported by `@growx/contracts`: `id`, `type`, `version`, `occurredAt`, nullable tenant identifiers, actor, data, and request/trace metadata. Identifiers are stable prefixed IDs and timestamps are UTC ISO 8601 values.

Phase 3 event types are `api_key.created`, `api_key.updated`, `api_key.rotated`, `api_key.revoked`, `api_key.expired`, `gateway.authentication.failed`, `gateway.permission.denied`, `gateway.rate_limit.exceeded`, and `gateway.budget.exceeded`. Payloads contain identifiers and policy versions, never secrets, hashes, headers, or credentials.

Phase 4 adds `gateway.request.accepted`, `gateway.request.started`, `gateway.routing.completed`, `gateway.provider.attempted`, `gateway.provider.failed`, `gateway.provider.fallback`, `gateway.stream.started`, `gateway.request.completed`, `gateway.request.failed`, `gateway.request.cancelled`, `provider.health.changed`, `model.created`, `model.updated`, and `model.deprecated`. Execution events carry event/request/trace and tenant/environment IDs plus timestamp; outbox publication is atomic with durable state.

Phase 5 adds `routing.decision.created`, `routing.fallback.triggered`, policy lifecycle events, provider capacity/circuit/drain/maintenance events, cache hit/miss/eviction events, `request.deduplicated`, and provider-budget threshold events. Routing events include immutable policy/model/pricing versions and safe score metadata. Consumers tolerate additive fields; breaking changes increment event version.

Initial event types are identity user creation/email verification/session creation/session revocation; organization creation/update/member invitation/join/removal/role change; team creation/member addition; workspace creation/update/archive; environment creation/update; and authorization permission denial.

Events are appended to the transactional outbox in the same database transaction as state changes. Publishers retry unpublished rows and consumers are idempotent by event ID. Event data must not contain passwords, cookies, provider credentials, raw invitation/reset/verification tokens, or other secrets. Additive fields are backward compatible; incompatible changes require a new event version.
