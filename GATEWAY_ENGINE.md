# Gateway Engine

Phase 3 fixes the gateway access pipeline in this order: request context, Bearer key parsing, HMAC verification, tenant/environment resolution, scope and model authorization, IP policy, rate limiting, concurrency leasing, and budget enforcement. A request proceeds only when every stage allows it. Provider execution is excluded until Phase 4.

Request context contains `requestId`, `traceId`, `receivedAt`, `clientIp`, sanitized `userAgent`, and—only after authentication—the key and tenant identifiers. Logs must never contain authorization headers, key material, hashes, passwords, or provider credentials.

Redis namespaces are `gateway:key:<keyId>`, `ratelimit:{key|workspace|organization}:<id>`, and `concurrency:{key|workspace|organization}:<id>`. Metadata cache TTL is configured by `GATEWAY_KEY_CACHE_TTL_SECONDS`. Revocation and policy/status changes invalidate affected keys immediately. Database fallback is allowed for cache failure; rate, concurrency, revocation-state uncertainty, and hard-budget checks fail closed. Concurrency leases use atomic acquisition, release in `finally`, and a safety TTL.

Phase 4 continues with strict body validation, versioned model/alias resolution, capability checks, deterministic routing, provider health, adapter translation, execution, streaming, usage/cost-input capture, outbox emission, and finalization. Attempts are bounded and retry only transient failures. Fallback never occurs for customer/auth/policy errors or after visible stream output. Client close and configured timeouts propagate AbortSignals through adapters. Analytics delivery cannot invalidate an otherwise successful response.

## Phase 5 intelligent routing

Candidates are generated from the versioned alias/model registry, then filtered by capabilities, security/entitlement, region, health, circuit, capacity, cost, and latency constraints. Eligible candidates receive normalized scores in `[0,1]`: `final = costWeight×costScore + latencyWeight×latencyScore + reliabilityWeight×reliabilityScore + capacityWeight×capacityScore + preferenceWeight×preferenceScore`. Weights are versioned configuration and must sum to one. Strategy policies may select one dimension instead. Weighted traffic uses SHA-256 stable assignment, not runtime randomness.

Before execution the gateway performs tenant-isolated exact-cache and safe in-flight-deduplication checks. Circuits and provider bulkheads are checked atomically. Retry/fallback share bounded attempt and duration budgets and never apply to customer errors/cancellation or after visible output. NORMAL enables all policy features; DEGRADED disables experiments/advanced optimization while retaining safe priority fallback; EMERGENCY uses audited static routes. Redis safety-state failure uses conservative persisted snapshots and disables advanced weighting rather than routing blindly.
