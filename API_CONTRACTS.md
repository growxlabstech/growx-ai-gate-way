# API Contracts

Public REST endpoints live below `/v1`. Contracts, DTOs, Zod schemas, enums, error envelopes, event types, and generated OpenAPI schemas belong to `@growx/contracts`. A request crosses a transport boundary only after validation.

Errors use `{ "error": { "code": string, "message": string, "requestId": string } }`. Breaking changes require a new version. Additive changes must remain backward compatible. Mutating endpoints accept idempotency keys where retries are possible.

Every deployable exposes `/health` for aggregate status, `/live` for process liveness, and `/ready` for dependency readiness. These endpoints never expose secrets or detailed internal topology.

## Phase 2 endpoints

## Phase 3 gateway and keys

Control-plane routes live under `/v1/organizations/:organizationId/workspaces/:workspaceId/api-keys`, with list/create, get/patch/delete, `POST /:apiKeyId/rotate`, and GET/PUT subresources for `permissions`, `models`, `rate-limits`, `spending-limit`, and `ip-rules`. All resolve authenticated membership, tenant scope, permission, and resource status. Create/rotate alone return `secret`; subsequent reads return prefix and metadata. Create accepts `Idempotency-Key`.

Gateway authentication is exclusively `Authorization: Bearer gx_<environment>_<keyId>_<secret>`. Private beta exposes `GET /v1/auth/check`. Denials return `{ "error": { "type", "code", "message", "requestId" } }`; authentication errors are 401, policy/status denials 403, and exhausted rate/concurrency/budget limits 429. Limit responses include `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset`.

Phase 4 exposes `GET /v1/models`, `POST /v1/responses`, `POST /v1/chat/completions`, and `POST /v1/embeddings`. JSON bodies are strict and size-limited. Responses/chat support SSE with monotonic GrowX event sequences and `[DONE]`; closing the connection cancels provider work. Non-streaming requests may use an idempotency key scoped to tenant, endpoint, and body fingerprint. Provider errors are redacted into stable GrowX codes; 400 covers validation/capability, 429 exhausted provider rate limits, 503 unavailable models/providers, and 504 timeouts.

Phase 5 internal/admin contracts expose versioned routing-policy create/clone/activate/rollback/archive, traffic allocations, provider health/capacity reads, circuit reset/force controls, drain/maintenance controls, and cache inspect/flush. All mutations require the corresponding centralized permission, explicit tenant/global scope, reason, audit event, and optimistic version. Reusing an idempotency key with a different body returns HTTP 409 `idempotency_key_conflict`.

## Phase 3 gateway and keys

Control-plane routes live under `/v1/organizations/:organizationId/workspaces/:workspaceId/api-keys`, with list/create, get/patch/delete, `POST /:apiKeyId/rotate`, and GET/PUT subresources for `permissions`, `models`, `rate-limits`, `spending-limit`, and `ip-rules`. All resolve authenticated membership, tenant scope, permission, and resource status. Create/rotate alone return `secret`; subsequent reads return prefix and metadata. Create accepts `Idempotency-Key`.

Gateway authentication is exclusively `Authorization: Bearer gx_<environment>_<keyId>_<secret>`. Private beta exposes `GET /v1/auth/check`. Denials return `{ "error": { "type", "code", "message", "requestId" } }`; authentication errors are 401, policy/status denials 403, and exhausted rate/concurrency/budget limits 429. Limit responses include `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset`.

Identity routes under `/v1/auth` provide registration, login/logout, email verification, password recovery, current/all sessions, and session revocation. Better Auth also mounts magic-link and Google/GitHub OAuth flows.

Organization routes provide collection/create/read/update/archive, members, create/cancel invitations, and token acceptance. Workspace routes are nested below `/v1/organizations/:organizationId/workspaces` and provide CRUD plus environment collection/create. Authorization routes expose roles and permissions and assign/revoke member roles. Tenant path parameters are mandatory query scope, not merely resource lookup hints.

Collections return `{ data, pagination: { cursor, hasMore } }`; resources return `{ data }`; errors return `{ error: { code, message, requestId } }`.

# Console authentication boundary

The console exposes same-origin `/api/auth/*`, rewritten server-side to the identity service `/v1/auth/*`. Customer routes are gated by a fail-closed session check. This gate establishes authentication only; protected backend APIs must still resolve active membership, organization/workspace scope, permissions, and resource status.
