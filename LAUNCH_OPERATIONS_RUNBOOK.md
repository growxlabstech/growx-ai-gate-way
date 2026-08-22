# GrowX AI Gateway — Launch Operations & Incident Runbook

**Standard**: Production Incident Response & Operational Escalation  
**Scope**: Gateway Execution Engine, Provider Adapters, Database, Redis, Workers, and Billing Settlement

---

## 1. Incident Escalation Matrix

| Critical Domain                 | Primary Owner         | Escalation Destination | Pager Trigger                           | Target Triage Time |
| :------------------------------ | :-------------------- | :--------------------- | :-------------------------------------- | :----------------: |
| **AI Gateway Core & Streaming** | Gateway SRE Team      | `#ops-gateway-alerts`  | 5xx Spike > 0.5% / TTFT > 250ms         | $< 5\text{ mins}$  |
| **Provider Vault & Adapters**   | Provider Ops Team     | `#ops-provider-alerts` | Upstream Circuit Breaker Open           | $< 5\text{ mins}$  |
| **PostgreSQL & Ledger DB**      | Database Admin Team   | `#ops-db-alerts`       | Pool Saturation > 85% / Lock Contention | $< 5\text{ mins}$  |
| **Redis Cache & Leases**        | Cache Platform Team   | `#ops-redis-alerts`    | Memory > 80% / Eviction Spike           | $< 10\text{ mins}$ |
| **12 Worker Fleet**             | Worker Fleet Team     | `#ops-worker-alerts`   | Outbox Queue Backlog > 10,000           | $< 10\text{ mins}$ |
| **Wallet & Reconciliation**     | FinOps & Billing Team | `#ops-billing-alerts`  | Ledger Balance Drift > $0.00            | $< 5\text{ mins}$  |
| **Security & Tenancy**          | Security Ops Team     | `#ops-security-alerts` | Cross-tenant 403 Spike / Auth Anomaly   | $< 2\text{ mins}$  |

---

## 2. Operational Runbooks

### 2.1 Provider Outage Runbook

1. **Detect**: Alert fires `growx_gateway_provider_circuit_state{provider="openai"} == 1` (Open).
2. **Confirm**: Inspect `/admin/ops/providers` dashboard for upstream status and error response codes.
3. **Router Action**: Router V2 automatically shifts traffic to secondary fallback routes (`anthropic/claude-3-5-sonnet`).
4. **Drain / Disable**: If provider persists in 5xx state, execute JIT privileged command:
   ```bash
   pnpm --filter @growx/admin ops:provider:drain --provider openai
   ```
5. **Customer Impact**: Zero dropped requests; traffic seamlessly served by fallback route.
6. **Recovery**: Verify upstream health probe returns 200 OK for 10 consecutive pings; restore traffic to primary route.

---

### 2.2 Database Saturation & Outage Runbook

1. **Detect**: `pg_stat_activity` active connections exceed 85% of pool capacity (`max: 10` per pod).
2. **Action**:
   - Inspect long-running locks in `system_audit_events` or `request_logs`.
   - Scale persistent container compute instances if throughput exceeds single-node pool limits.
   - Fail closed on write-critical endpoints (wallet grants) while keeping read-only cached inference routes open.

---

### 2.3 Worker Queue Backlog Runbook

1. **Detect**: `outbox_events` unconsumed backlog exceeds 10,000 items.
2. **Action**:
   - Verify worker lease acquisition logs in Pino log stream.
   - Scale worker replicas for `usage-worker` and `usage-settlement-worker`.
   - Ensure Redis lease timeout (`leaseDurationMs: 30000ms`) is not stuck on dead workers.

---

### 2.4 Wallet Drift & Financial Mismatch Runbook

1. **Detect**: Reconciliation worker emits mismatch event between `credit_lots`, `wallet_balances`, and `ledger_entries`.
2. **Action**:
   - Freeze automated self-serve top-ups on affected organization.
   - Run transactional audit replay:
     ```bash
     pnpm --filter @growx/admin ops:wallet:reconcile --org-id <orgId>
     ```
   - Compensating ledger entry appended idempotently; raw balances are never manually edited.

---

### 2.5 Credential Compromise & Revocation Runbook

1. **Detect**: Customer or operator reports compromised API key or provider vault secret.
2. **Action**:
   - Customer Key: Revoke via `/api-keys` console view or Admin JIT tool. Invalidates Redis cache immediately within 50ms.
   - Upstream Provider Secret: Activate new version in Provider Credential Vault (`ProviderCredentialResolver`), transition active version, and drain previous key without downtime.

---

### 2.6 Bad Deployment & Rollback Runbook

1. **Detect**: Release deployment triggers smoke test failure or 5xx spike post-canary.
2. **Action**:
   - Execute instant rollback via `ReleaseOrchestrator`:
     ```typescript
     releaseOrchestrator.rollbackRelease(relId, "error_budget_breach");
     ```
   - Revert DNS/container routing to previous immutable image tag. Schema migrations remain backward-compatible (Expand/Contract).
