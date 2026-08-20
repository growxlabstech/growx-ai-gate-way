# Production Risk Register

| ID | Risk | Severity | Likelihood | Mitigation / owner | Deadline | Acceptance |
|---|---|---|---|---|---|---|
| R-001 | Phase 6 payment and financial repositories not production complete | Critical | High | Complete sandbox adapters, migrations, concurrency and reconciliation / Billing | Before beta | Not accepted |
| R-002 | Phase 7 privileged plane is not deployed end-to-end | Critical | High | Dedicated identity, MFA, JIT, approval and immutable audit gateway / Security | Before beta | Not accepted |
| R-003 | Tenant isolation lacks full DB/cache/search/storage adversarial evidence | Critical | Medium | Implement matrix-driven integration suite / all owners | Before beta | Not accepted |
| R-004 | Backup restore and deployment rollback untested | Critical | Medium | Isolated restore and rollback drills / Platform | Before beta | Not accepted |
| R-005 | Capacity, streaming and soak limits unknown | High | High | Execute load plan and set quotas/headroom / Gateway | Before beta | Not accepted |
| R-006 | External penetration and infrastructure IAM reviews incomplete | High | High | Schedule independent review and remediate / Security | Before expansion | Not accepted |
| R-007 | Single-region architecture has regional failure exposure | High | Medium | Explicit beta limitation, recovery plan and future redundancy / Platform | Reviewed before beta | Pending decision |

Risk acceptance requires a named approver, rationale and expiration; silence is not acceptance.
