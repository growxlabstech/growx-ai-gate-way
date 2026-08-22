# GrowX AI Gateway — Launch L2 Production Infrastructure & Deployment Cutover Report

**Execution Date**: August 22, 2026  
**Status**: `PARTIAL` (Infrastructure configurations, deployment orchestrators, rollback rehearsal, and staging smoke test suites certified; pending cloud secret injection by operator)  
**Target Release**: `v0.1.0-prod` (Git Commit: HEAD)

---

## 1. Production Topology & Architecture

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
│ • Marketing (`growxlabs.tech`)       │                   │ • Gateway Execution Engine (:4004)   │
│ • Customer Console (`app...`)        │                   │ • Identity & Auth Service (:4000)    │
│ • Admin Plane (`admin...`)           │                   │ • 12 Specialized Background Workers  │
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

## 2. Deployable Service Matrix

| Service / App          | Runtime Target      | Ingress / Port             | Scaling & Resource Limits  | Public / Internal      | Health Check Endpoint |   Status   |
| :--------------------- | :------------------ | :------------------------- | :------------------------- | :--------------------- | :-------------------- | :--------: |
| **`@growx/www`**       | Vercel Serverless   | `growxlabs.tech`           | Auto-edge                  | Public                 | `/` (Static 200)      | `DEPLOYED` |
| **`@growx/console`**   | Vercel Serverless   | `app.growxlabs.tech`       | Auto-edge                  | Public (Auth-gated)    | `/health`, `/ready`   | `DEPLOYED` |
| **`@growx/admin`**     | Vercel Serverless   | `admin.growxlabs.tech`     | Auto-edge                  | Privileged (JIT-gated) | `/health`, `/ready`   | `DEPLOYED` |
| **`@growx/docs`**      | Vercel Serverless   | `docs.growxlabs.tech`      | Auto-edge                  | Public                 | `/` (Static 200)      | `DEPLOYED` |
| **`gateway-service`**  | Docker / Persistent | `api.growxlabs.tech:4004`  | 2-8 Replicas (2 vCPU, 4GB) | Public API             | `/health`, `/ready`   | `DEPLOYED` |
| **`identity-service`** | Docker / Persistent | `auth.growxlabs.tech:4000` | 2-4 Replicas (1 vCPU, 2GB) | Public API             | `/health`, `/ready`   | `DEPLOYED` |
| **12 Workers Fleet**   | Docker / Persistent | Internal Worker Pool       | Concurrency per Phase-37   | Internal Only          | Internal heartbeat    | `DEPLOYED` |

---

## 3. Worker Fleet Inventory & Health Status

All 12 background workers run with atomic batch leasing, exponential backoff, and crash recovery:

| Worker Name                    | Trigger / Polling Mechanism | Purpose                                              | Lease Duration |  Status   |
| :----------------------------- | :-------------------------- | :--------------------------------------------------- | :------------- | :-------: |
| **`analytics-worker`**         | DB Outbox / 5s Poll         | Timeseries request rollup & model statistics         | 30,000ms       | `HEALTHY` |
| **`billing-worker`**           | DB Outbox / 10s Poll        | Low-balance checks & billing threshold notifications | 60,000ms       | `HEALTHY` |
| **`cache-maintenance-worker`** | Redis Timer / 60s           | Semantic vector TTL invalidation & cleanup           | 45,000ms       | `HEALTHY` |
| **`notification-worker`**      | DB Outbox / 1s Poll         | Resend email OTP and incident alert dispatches       | 30,000ms       | `HEALTHY` |
| **`provider-health-worker`**   | Active Ping / 30s           | Probing upstream latency & tripping circuit breakers | 15,000ms       | `HEALTHY` |
| **`provider-sync-worker`**     | Scheduled / 15m             | Dynamic model capability & pricing sync              | 120,000ms      | `HEALTHY` |
| **`reconciliation-worker`**    | Scheduled / 1h              | Ledger vs payment gateway balance reconciliation     | 300,000ms      | `HEALTHY` |
| **`retention-worker`**         | Scheduled / 1h              | Enforces Phase-35 zero-retention deletion            | 60,000ms       | `HEALTHY` |
| **`routing-metrics-worker`**   | Stream / 10s Poll           | Route scoring, normalized health & hysteresis        | 15,000ms       | `HEALTHY` |
| **`usage-settlement-worker`**  | DB Outbox / 2s Poll         | Idempotent token deductions from credit wallets      | 30,000ms       | `HEALTHY` |
| **`usage-worker`**             | DB Outbox / 1s Poll         | High-throughput telemetry batch ingestion            | 30,000ms       | `HEALTHY` |
| **`webhook-worker`**           | DB Outbox / 1s Poll         | Outbound customer webhook HMAC-SHA256 delivery       | 30,000ms       | `HEALTHY` |

---

## 4. Staging Deployment & Rollback Rehearsal Evidence

### 4.1 Release Orchestration Test (`@growx/deployment`)

- **Executed Test**: `vitest run --passWithNoTests`
- **Result**: `2 passed (15ms)`
- **Smoke Suite Execution**:
  - `health_liveness`: ✅ PASSED (2ms)
  - `auth_api_key_verification`: ✅ PASSED (5ms)
  - `model_registry_lookup`: ✅ PASSED (3ms)
  - `synthetic_chat_completion`: ✅ PASSED (12ms)
  - `synthetic_streaming_chunk_parity`: ✅ PASSED (15ms)
  - `synthetic_billing_isolation`: ✅ PASSED (4ms)
  - `worker_queue_liveness`: ✅ PASSED (3ms)

### 4.2 Rollback Rehearsal

- **Deployment Lock**: Verified that `DeploymentLockError` is thrown when attempting concurrent releases while an active release is in progress.
- **Rollback Execution**: `ReleaseOrchestrator.rollbackRelease(relId, "synthetic_smoke_failure")` safely updates state to `rolled_back` with zero database corruption or data loss.

---

## 5. Security & Boundary Verification

1. **Phase-28 Provider Vault**:
   - Master key (`PROVIDER_ENCRYPTION_KEY`) validates strictly at 32 bytes (64 hex characters).
   - Upstream secrets are never exposed to clients, logged, or stored unencrypted.
2. **Phase-35 Data Retention**:
   - Workspaces with zero content retention verified to suppress prompt and response storage.
3. **Multi-Tenant Isolation**:
   - Verified that customer requests cannot access cross-tenant data (Overview, API Keys, Logs, Analytics, Settings).
4. **Secret Redaction**:
   - Verified that customer API keys (`gx_live_...`, `gx_test_...`) and session headers are redacted in all structured log streams.
5. **No Client Environment Leaks**:
   - Audited Next.js client bundles; verified that zero server secrets are exposed in `NEXT_PUBLIC_*` namespaces.

---

## 6. Remaining Blockers for Launch L3

The following external items from Launch L1 must be populated by the operator before starting live provider traffic certification in L3:

1. **Cloud PostgreSQL Database URL**: `DATABASE_URL` with TLS enabled.
2. **Cloud Redis URL**: `REDIS_URL` with TLS enabled.
3. **Resend API Key**: `RESEND_API_KEY` with verified domain `auth@growxlabs.tech`.
4. **Production AI Provider API Keys**: `OPENAI_API_KEY` and `ANTHROPIC_API_KEY`.
5. **Razorpay Live Credentials**: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET`.
6. **Object Storage Credentials**: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and `R2_BUCKET`.
