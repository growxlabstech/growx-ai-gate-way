# GrowX AI Gateway — Operator Admin & Operations Plane UX Specification (D9)

## 1. Executive Summary & Design Principle

The GrowX Operator Admin Plane (`apps/admin`) is the privileged command center for GrowX platform operators and infrastructure engineers. It is strictly separated from the customer console and enforces Obsidian × Ice × Frost styling with professional density. The admin product prioritizes high-signal operational indicators, zero fake health status, and strict secret protection.

---

## 2. Information Architecture & Navigation

```
GrowX Operator Admin Plane (/admin/...)
│
├── Platform Operations
│   ├── Operations Overview (/admin) - Active Incidents, Degraded Circuits, Worker Pools
│   ├── Global Users (/admin/users) - User search, MFA status, account suspension
│   ├── Organizations (/admin/organizations) - Customer boundaries, spend, tier
│   └── Workspaces (/admin/workspaces) - Gateway instances, environment isolation, quotas
│
├── AI Infrastructure Plane
│   ├── Upstream Providers (/admin/providers)
│   │   ├── Provider Health & Circuits (/admin/providers/health)
│   │   ├── Capacity & Quota Pooling (/admin/providers/capacity)
│   │   ├── Circuit Breakers & Drain Controls (/admin/providers/circuits)
│   │   └── Phase-28 Write-Only Credential Rotation (Secret Vault)
│   ├── Model Registry (/admin/models) - Catalog, capabilities, emergency kill switches
│   └── Router V2 Orchestration (/admin/routing)
│       ├── Policies (/admin/routing/policies) - Multi-objective weights & latency rules
│       └── Traffic Allocation (/admin/routing/traffic) - Dynamic weights & canary split
│
└── Operations & Security Plane
    ├── Audit Stream (/admin/audit-events) - Append-only tamper-evident hash-chained log
    ├── Security Signals (/admin/security-events) - Automated rate-limit and IP alerts
    └── Cache Operations (/admin/cache) - Exact & Semantic cache hit rates
```

---

## 3. Just-In-Time (JIT) Privileged Access & Step-Up (Phase 1/2)

- **Step-Up Authentication**: High-risk operator actions (provider credential rotation, model kill-switches, user suspension, wallet adjustments) require an active JIT session with explicit capabilities (`ops.provider.manage`, `ops.routing.manage`, `ops.billing.adjust`).
- **Time-Bounded & Audited**: JIT sessions require an operator justification and ticket reference, expire automatically after a configured TTL, and emit tamper-evident audit records.

---

## 4. Phase-28 Write-Only Provider Credential Security

- **Zero Decrypted Secrets in UI**: Upstream provider API keys (OpenAI, Anthropic, Google Vertex) are NEVER returned in plaintext or decrypted into the browser DOM.
- **Write-Only Rotation**: When an operator updates an upstream key, the secret is input into a write-only field, encrypted immediately using envelope encryption (AES-256-GCM) into the Secret Vault, and completely purged from memory.

---

## 5. Model Registry & Emergency Kill Switches

- **Centralized Model Catalog**: Operators inspect context windows, capability tags, input/output pricing, and provider mappings.
- **Emergency Kill Switch**: Disabling a model instantly updates Router V2 to divert customer traffic to secondary fallback targets or return graceful `model_unavailable` errors.

---

## 6. Tamper-Evident Immutable Audit Log (Phase 22)

- **Append-Only Invariant**: Audit records are strictly immutable. Zero edit or delete operations exist in the admin UI.
- **Cryptographic Hash Chaining**: Every privileged audit record contains a deterministic SHA-256 hash chain verifying log integrity.
