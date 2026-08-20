# Architecture

GrowX is a pnpm/Turborepo monorepo. `apps` contains user-facing Next.js deployables, `services` contains independently deployable HTTP processes, `workers` contains asynchronous consumers, and `packages` contains shared platform contracts. Dependencies flow from deployables toward packages; packages must never import deployables.

Services use layered boundaries: domain, application, infrastructure, transport, config, types, and utilities. Phase 1 exposes only health routes. Future synchronous communication uses versioned REST contracts and service authentication; asynchronous work uses the event bus with transactional outbox delivery.

The authentication boundary is prepared for OAuth, OIDC, magic links, passkeys, SSO, sessions, and RBAC. Identity proves who a principal is; authorization decides what that principal can do. They remain separate services.

Phase 2 implements Better Auth in the identity service for email/password, verification, reset, magic-link, Google, and GitHub flows. Better Auth owns credential/session mechanics; GrowX services own user status, tenant membership, workspace scope, and authorization policy. Passkeys, TOTP, OIDC, SAML, enterprise SSO, and SCIM attach through explicit provider/plugin extension points.

## Phase 4 data plane

The control plane owns tenants, keys, provider configuration, model metadata, and routing policy. The gateway data plane authenticates, validates, resolves models, requests a versioned routing decision, and calls only the GrowX provider-execution interface. Adapters isolate provider/Vercel payloads. Streaming uses bounded Web/Node stream backpressure and cancellation; usage is emitted durably and ingested asynchronously without retaining prompts by default.

Organization creation is one transaction: organization, owner membership and role, default workspace and development environment, audit event, and outbox event. Tenant repositories always scope organization-owned reads by organization ID and workspace reads by both organization and workspace IDs. GrowX company identity is integrated only through stable external customer IDs, signed events, or federation—not shared tables.

Runtime topology consists of Vercel-hosted web apps plus containerized services/workers, PostgreSQL as system of record, Redis for coordination, and Cloudflare R2 through the storage service abstraction.

## Phase 6 commercial plane

The gateway performs only pricing lookup and atomic credit reservation synchronously. Immutable usage is settled asynchronously into exact provider cost, customer charge, grant consumption, and balanced ledger postings. Payment providers are isolated behind Payment Service adapters and verified webhooks. PostgreSQL remains financial truth; cached wallet balances and analytics are projections that reconciliation can rebuild or challenge. See `PRICING_AND_BILLING.md` for invariants and the current release boundary.
# Identity compatibility boundary

The identity stack remains TypeScript, Better Auth, Drizzle, and PostgreSQL. `GrowXBetterAuthAdapter` is the sole translation boundary between Better Auth logical models and GrowX physical tables. Better Auth owns email-OTP verification records in `verifications`; GrowX invitation and password-reset verification records remain separate flows in `verification_tokens`.
