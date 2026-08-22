# GrowX AI Gateway — Production Deployment & Topology Guide

## 1. Overview & Architectural Boundaries

The GrowX AI Gateway production environment follows a decoupled, resilient micro-tier topology designed for high throughput, sub-100ms TTFT (Time-To-First-Token) streaming, zero-trust credential handling, and strict multi-tenant isolation.

```
                                  ┌─────────────────────────────┐
                                  │   Cloudflare DNS / TLS 1.3  │
                                  └──────────────┬──────────────┘
                                                 │
                   ┌─────────────────────────────┴─────────────────────────────┐
                   ▼                                                           ▼
┌──────────────────────────────────────┐                   ┌──────────────────────────────────────┐
│           Vercel Platform            │                   │       Persistent Compute Pool        │
│        (Next.js App Router)          │                   │          (Docker / Container)        │
├──────────────────────────────────────┤                   ├──────────────────────────────────────┤
│ • Marketing Web (`growxlabs.tech`)   │                   │ • Gateway Execution Service (:4004)  │
│ • Customer Console (`app...`)        │                   │ • Identity & Auth Service (:4000)    │
│ • Admin Operations (`admin...`)      │                   │ • 12 Specialized Background Workers  │
│ • Developer Docs (`docs...`)         │                   │ • Model Registry, Pricing & Routing  │
└──────────────────────────────────────┘                   └──────────────────┬───────────────────┘
                                                                              │
                                      ┌───────────────────────────────────────┴───────────────────────────────────────┐
                                      ▼                                                                               ▼
                   ┌──────────────────────────────────────┐                                ┌──────────────────────────────────────┐
                   │       Managed PostgreSQL 17          │                                │           Managed Redis 8            │
                   │     (Drizzle Migrations 0000-0019)   │                                │      (Cache, Rate Limits, Leases)    │
                   └──────────────────────────────────────┘                                └──────────────────────────────────────┘
```

---

## 2. Platform Targets & Responsibilities

### 2.1 Vercel Edge & Control Plane

- **`apps/www`**: Public marketing and pricing landing page (`growxlabs.tech`).
- **`apps/console`**: Multi-tenant customer developer console (`app.growxlabs.tech`). Handles API keys, interactive playground, request logs, usage analytics, billing checkouts, and workspace settings.
- **`apps/admin`**: Operator-only admin and ops plane (`admin.growxlabs.tech`). Requires JIT capability grants and multi-factor auth.
- **`apps/docs`**: Developer API documentation and OpenAPI explorer (`docs.growxlabs.tech`).

### 2.2 Persistent Compute (Docker / ECS / K8s)

- **`services/gateway-service`**: High-performance HTTP/SSE streaming inference runtime. Connects Just-In-Time to upstream AI providers, applies policy governance, handles structured output validation, and captures durable usage metrics.
- **`services/identity-service`**: Better Auth engine with hashed session lookups, passwordless Email OTP, and workspace context resolution.
- **12 Background Workers**:
  1. `analytics-worker`: Asynchronous aggregation and timeseries rollup.
  2. `billing-worker`: Wallet settlement and low-balance notifications.
  3. `cache-maintenance-worker`: Eviction and single-flight invalidation.
  4. `notification-worker`: Transactional email and alert escalation dispatch.
  5. `provider-health-worker`: Active provider latency probing and circuit state management.
  6. `provider-sync-worker`: Dynamic model capability and pricing catalog synchronization.
  7. `reconciliation-worker`: Ledger vs payment gateway balance reconciliation.
  8. `retention-worker`: Enforces Phase-35 zero-retention policies on customer prompts and payloads.
  9. `routing-metrics-worker`: Real-time route score calculation and hysteresis tracking.
  10. `usage-settlement-worker`: Idempotent token deductions from credit wallets.
  11. `usage-worker`: High-throughput telemetry batch ingestion.
  12. `webhook-worker`: HMAC-signed customer event delivery with exponential backoff and jitter.

---

## 3. Database & State Management

- **PostgreSQL 17**: Authoritative multi-tenant persistence. Strict isolation by `organization_id` and `workspace_id`.
- **Migrations**: 20 expand/contract migration SQL scripts (`packages/database/migrations/0000_` to `0019_`).
- **Migration Command**: `pnpm --filter @growx/database drizzle-kit migrate`
- **Redis 8**: Ephemeral exact/semantic cache, distributed token-bucket rate limiting, deduplication windows, and worker lease claiming.

---

## 4. Release & Deployment Pipeline (Phase 39)

1. **Pre-flight CI**: Linting, Typecheck, Unit Tests (`pnpm test`), and 50 E2E Playwright Interaction Tests.
2. **Staging Rollout**:
   - Apply non-destructive expand migrations.
   - Deploy persistent container images to staging compute.
   - Deploy staging Vercel preview environments.
   - Run synthetic smoke test suite (`SmokeValidator.executeSmokeSuite()`).
3. **Rollback Rehearsal**: Verify previous immutable container artifact operates without error against the expanded schema.
4. **Production Deployment & Canary**:
   - Deployment Lock acquired (`DeploymentLockError` prevents concurrent runs).
   - Roll out 5% -> 25% -> 100% canary traffic.
   - Monitor error rate, TTFT latency budgets, and provider health circuits.
   - Instant rollback if 5xx error spikes or financial drift is detected.
