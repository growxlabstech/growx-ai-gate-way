# Database

PostgreSQL is the system of record. `@growx/database` owns the Drizzle connection, schema, migrations, transaction boundary, and outbox table. Each service must access data through its own repository interfaces and must not reach into another service's tables.

Set `DATABASE_URL`, generate migrations with `pnpm --filter @growx/database db:generate`, review SQL, then run `db:migrate`. Migrations are forward-only in production and require a backup and rollback plan. Readiness checks must fail when a required database connection is unavailable.

Local PostgreSQL runs through Docker Compose. Seeds must be deterministic and must never contain production secrets or personal data.

Phase 2 uses snake_case PostgreSQL names and camelCase TypeScript properties. The schema defines users, accounts, sessions, verification tokens, organizations, organization members/invitations, teams/members, workspaces/members/teams, environments, roles, permissions, role permissions, member roles, audit events, security events, and the outbox. Tenant uniqueness and lookup indexes are declared in `packages/database/src/schema.ts`.

Phase 3 adds `api_keys`, `api_key_permissions`, `api_key_model_rules`, `api_key_rate_limits`, `api_key_spending_limits`, `api_key_ip_allowlists`, and `api_key_usage_snapshots`. Every child is keyed through `api_keys`; lifecycle records restrict tenant deletion, policy rows cascade with a key, and usage snapshots are retained when a key is revoked. Prefixes are unique. Tenant, environment, status/expiry, last-use, and period lookup indexes are declared in schema.

Phase 4 adds providers/connections/encrypted credentials, provider models/capabilities/health/pricing, versioned aliases/availability/deprecations, versioned routing policies/rules/fallback chains, and immutable execution records (`gateway_requests`, `routing_decisions`, `provider_attempts`, `usage_records`, `token_usage_records`, `latency_records`, `error_records`). Prompt and response content are excluded. Financial estimates use integer minor units and pricing-version references.

Phase 5 completes routing conditions/actions, traffic allocations, provider weights, candidate scores, capacity limits/snapshots, distributed circuit state, maintenance windows, tenant-isolated cache records, and idempotency records. PostgreSQL remains transactional truth. High-volume ClickHouse tables are `gateway_events`, `routing_events`, `provider_attempt_events`, `provider_health_events`, `fallback_events`, `cache_events`, `latency_events`, and `token_events`; raw retention is configurable and aggregate retention is longer.

Phase 6 adds billing accounts/profiles, plans and immutable plan versions, subscriptions/periods, pricing/model/conversion versions, wallets/grants/reservations/adjustments, payment methods/payments/events/refunds, invoices/lines, tax profiles/rates, exchange rates, ledger accounts/transactions/entries, usage settlements, provider cost records, and reconciliation runs/items. Monetary and credit columns use `bigint`; idempotency and provider-event keys are unique; ledger corrections are new reversal transactions rather than updates.

Phase 3 adds `api_keys`, `api_key_permissions`, `api_key_model_rules`, `api_key_rate_limits`, `api_key_spending_limits`, `api_key_ip_allowlists`, and `api_key_usage_snapshots`. Every child is keyed through `api_keys`; lifecycle records restrict tenant deletion, policy rows cascade with a key, and usage snapshots are retained when a key is revoked. Prefixes are unique. Tenant, environment, status/expiry, last-use, and period lookup indexes are declared in schema.

Raw authentication, reset, verification, and invitation tokens are never columns. Only token hashes or encrypted provider credentials are persisted. Tenant parent deletion cascades only through subordinate membership/configuration data; user ownership and audit references are restricted.
# Authentication migration baseline

`0000_bitter_azazel.sql` is the reproducible schema baseline. `0001_auth_compat_expand.sql` adds the Better Auth verification model and OAuth compatibility fields without removing existing identity schema. Historical sessions are deleted during this major migration because their token representation cannot be proven compatible; users must sign in again. Contract/removal work is intentionally deferred to a later verified deployment.

BigInt counters use SQL defaults such as `default(sql\`0\`)`. JavaScript `0n` defaults caused Drizzle Kit snapshot JSON serialization to fail and must not be reintroduced.
