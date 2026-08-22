# GrowX AI Gateway — Public Launch Day Checklist

**Target Release**: `v0.1.0-prod`  
**Execution Standard**: Strict Zero-Downtime Cutover & Controlled Availability

---

## 1. Pre-Launch Infrastructure Gates (T - 2 Hours)

- [x] **Database Migrations**: All 20 Drizzle migrations (`0000_` to `0019_`) applied and locked in PostgreSQL.
- [x] **Redis Health**: Memory utilization $< 100\text{MB}$, cluster nodes responsive, eviction policy `volatile-lru`.
- [x] **DNS & TLS Certificates**: Active TLS 1.3 certificates verified across `growxlabs.tech`, `app.growxlabs.tech`, `api.growxlabs.tech`, `auth.growxlabs.tech`, `docs.growxlabs.tech`, `admin.growxlabs.tech`.
- [x] **Provider Vault**: Upstream keys (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`) envelope-encrypted with `PROVIDER_ENCRYPTION_KEY`.
- [x] **12 Workers Fleet**: All 12 background workers running with active heartbeats and zero queue backlog.
- [x] **Observability**: OpenTelemetry collector active; Pino JSON log redaction verified.
- [x] **Automated Smoke Tests**: 50/50 Playwright E2E suites passing; `@growx/deployment` release orchestrator smoke tests passing.

---

## 2. Launch Execution & Traffic Enablement (T - 0)

- [ ] **Step 1: Release Lock Verification**: Confirm no concurrent deployment locks exist in `ReleaseOrchestrator`.
- [ ] **Step 2: Canary Routing**:
  - Shift 5% public traffic $\rightarrow$ Observe error rate & TTFT for 15 mins.
  - Shift 25% public traffic $\rightarrow$ Observe database connections & Redis cache hits for 15 mins.
  - Shift 100% public traffic $\rightarrow$ Transition release status to `deployed`.
- [ ] **Step 3: Enable Public Registration**: Toggle self-serve signup on `app.growxlabs.tech` with strict rate limits and email OTP verification.
- [ ] **Step 4: Publish Public Model Catalog**: Expose `growx/fast`, `openai/gpt-4o`, `anthropic/claude-3-5-sonnet`.
- [ ] **Step 5: Publish Developer Docs & SDK**: Verify `@growx/ai` and `@growx/cli` public package availability.

---

## 3. Post-Launch Immediate Verification (T + 15 Mins)

- [ ] **Test Request**: Execute public cURL getting started request against `https://api.growxlabs.tech/v1/chat/completions`.
- [ ] **TTFT Check**: Confirm P95 TTFT is $< 120\text{ms}$.
- [ ] **Billing Verification**: Confirm test request properly debited credit wallet and recorded usage in request logs.
- [ ] **Support Queue Check**: Confirm `#ops-support-queue` is receiving alerts and developer queries.

---

## 4. Emergency Kill Switches

| Risk / Incident               | Emergency Command                             | Operator Privilege Required |
| :---------------------------- | :-------------------------------------------- | :-------------------------- |
| **Halt Public Signups**       | `ops:auth:disable-self-serve`                 | JIT `ops.security.admin`    |
| **Drain Failing Provider**    | `ops:provider:drain --provider <name>`        | JIT `ops.providers.manage`  |
| **Revoke Malicious API Key**  | `ops:api-keys:emergency-revoke --key-id <id>` | JIT `ops.keys.revoke`       |
| **Instant Platform Rollback** | `ops:deployment:rollback --release <relId>`   | JIT `ops.deployment.manage` |
