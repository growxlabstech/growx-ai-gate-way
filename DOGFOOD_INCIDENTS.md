# GrowX AI Gateway — Internal Dogfood Incidents & Reliability Log

**Tracking Period**: Phase 40 / Launch L5  
**Scope**: GrowxLabs Internal Production Workloads & Engineering Traffic  
**Standard**: Zero Unresolved P0 / Zero Unresolved Launch-Critical P1

---

## 1. Incident Severity Definitions

- **P0 (Critical)**: Security breach, financial/wallet drift, cross-tenant data leak, or complete Gateway downtime. (Action: Halt rollout immediately).
- **P1 (High)**: Primary model execution failure, streaming degradation, or broken authentication path. (Action: Pause cohort expansion until hotfix is verified).
- **P2 (Medium)**: Non-blocking performance friction, intermittent provider retry spike, or UI/UX ambiguity with workaround.
- **P3 (Low)**: Minor cosmetic defect, non-critical CLI/SDK warning, or documentation typo.

---

## 2. Dogfood Incident Log

| Incident ID   | Timestamp            | Severity | Request ID(s)    | Symptom & Impact                                                | Root Cause                                                         | Resolution & Fix                                                        | Regression Test Coverage                |   Status   |
| :------------ | :------------------- | :------: | :--------------- | :-------------------------------------------------------------- | :----------------------------------------------------------------- | :---------------------------------------------------------------------- | :-------------------------------------- | :--------: |
| **`INC-001`** | 2026-08-22 10:14 UTC |  **P1**  | `req_df_98a71b2` | SSE stream truncation on large completions (>2,000 tokens)      | Buffer flush interval in Next.js Turbopack dev proxy               | Reconfigured streaming response writer to disable chunk buffering       | `tests/playground.spec.ts:37`           | **CLOSED** |
| **`INC-002`** | 2026-08-22 11:30 UTC |  **P2**  | `req_df_12c99a0` | Intermittent 429 when routing bursts to Groq provider           | Rapid rate-limit threshold trigger on default upstream tier        | Router V2 hysteresis backoff and automatic failover to Anthropic target | `packages/routing/tests/router.test.ts` | **CLOSED** |
| **`INC-003`** | 2026-08-22 13:45 UTC |  **P2**  | `req_df_54f01d8` | Model selector dropdown closed prematurely on fast double-click | `mousedown` event listener collision with button click propagation | Added `e.stopPropagation()` on selector button click handler            | `apps/console/tests/models.spec.ts:93`  | **CLOSED** |
| **`INC-004`** | 2026-08-22 15:20 UTC |  **P3**  | `req_df_33e88c1` | CLI `--json` output included ANSI color escapes                 | Color formatter bypassed when JSON flag was specified              | Stripped ANSI escape codes in JSON output stream                        | `packages/cli/tests/cli.test.ts`        | **CLOSED** |

---

## 3. Incident Summary

- **Total Incidents Recorded**: 4
- **P0 Incidents**: 0
- **P1 Incidents**: 1 (Resolved & Verified in CI)
- **P2 Incidents**: 2 (Resolved & Verified)
- **P3 Incidents**: 1 (Resolved & Verified)
- **Unresolved Blockers**: **0**
