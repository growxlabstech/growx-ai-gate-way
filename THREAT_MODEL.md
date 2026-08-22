# Production Threat Model

Method: STRIDE. Review cadence: before every major release and at least quarterly. Critical or high threats block production unless formally accepted by security and executive owners.

## Assets and boundaries

Highly sensitive assets include API/service/provider/payment/webhook secrets, encryption/signing keys, privileged sessions, retained prompts/responses, financial ledger and credit balances. Confidential assets include request metadata, organization membership, routing/pricing configuration, invoices, exports and audit records.

Trust boundaries are Internet→edge, edge→public API, customer plane→gateway, gateway→internal services/data stores/providers, customer plane→privileged plane, privileged plane→security policy/audit, platform→payment providers/customer webhooks, and CI→production.

## Threat register

| ID    | STRIDE      | Attack path and impact                                | Required control                                                                    | Owner           | Status / residual risk                                  |
| ----- | ----------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------- | --------------- | ------------------------------------------------------- |
| T-001 | Spoofing    | Stolen API key executes cross-workspace traffic       | keyed hashes, scope/status checks, rotation, budgets, anomaly detection             | Identity        | Partial: leak detection workflow pending                |
| T-002 | Elevation   | Customer identity reaches `/internal/ops/*`           | separate workforce identity, strong MFA, JIT capability, expiry, fail-closed audit  | Security        | Partial: domain policy exists; deployed gateway pending |
| T-003 | Disclosure  | IDOR exposes another tenant's logs/export             | mandatory org/workspace repository arguments, non-disclosing denial, signed URLs    | Service owners  | Open: complete matrix tests pending                     |
| T-004 | Tampering   | Duplicate payment/settlement changes balance twice    | unique idempotency keys, serializable wallet operation, append-only balanced ledger | Billing         | Partial: concurrency certification pending              |
| T-005 | Disclosure  | Webhook SSRF reaches metadata/private network         | HTTPS/port policy, DNS validation at connect time, no redirects, bounded body/time  | Webhooks        | Partial: egress firewall test pending                   |
| T-006 | Repudiation | Operator changes production without evidence          | immutable privileged audit, reason, approval and session references; fail closed    | Security        | Partial: external tamper-resistance validation pending  |
| T-007 | DoS         | Large/slow/streaming requests exhaust gateway         | body/depth limits, deadlines, backpressure, rate/load shedding and attempt budgets  | Gateway         | Open: measured limits pending                           |
| T-008 | Tampering   | Dependency or CI compromise ships malicious artifact  | read-only CI, pinned lockfiles, scans, SBOM, provenance, protected branch           | Platform        | Open: scanner/provenance rollout pending                |
| T-009 | Disclosure  | Secrets enter logs/traces                             | structured redaction tests, no raw content by default, restricted sinks             | Observability   | Partial: sink-level validation pending                  |
| T-010 | DoS/Cost    | Retry/routing loop causes uncontrolled provider spend | maximum attempts/deadline, hard budgets, circuits and kill switches                 | Gateway/Billing | Partial: chaos/cost drill pending                       |

## Launch gate

No item above may be marked mitigated without linked test or operational evidence. This document currently records open high-impact validation work and therefore does not approve launch.
