# Roadmap

Phase 1 establishes repository, deployments, service boundaries, configuration, persistence, security, observability, and testing. Phase 2 establishes identity, sessions, organizations, workspaces, environments, centralized RBAC, audit/security events, notification templates, and customer/admin control-plane shells. Public gateway traffic, provider execution, API keys, and billing deduction remain excluded.

Subsequent phases implement identity and organization workflows, gateway and provider routing, model registry, usage ingestion, credits and billing, product interfaces, and operational hardening. New behavior must fit existing boundaries; boundary changes require an architecture decision record.

Phase 3 implements the API-key lifecycle and gateway access decision foundation: scoped keys, model/IP rules, rate and concurrency limits, budget policy, caching contracts, audit/security events, and control-plane screens. Provider execution remains Phase 4.

Phase 4 implements canonical AI contracts, model/provider registries, versioned aliases, deterministic routing/fallback, provider adapters, responses/chat/embedding endpoints, streaming/cancellation, normalized errors and usage, execution persistence, and initial playground/catalog/log/admin surfaces. Phase 5 owns advanced intelligent routing and reliability.

Phase 5 is Production Reliability & Intelligent Routing: policy precedence/versioning, cost/latency/reliability/balanced and stable weighted routing, capacity/load balancing, health scoring, circuits, retry budgets, cache/dedup/idempotency, degraded modes, decision analytics, and operational controls. Phase 6 owns commercial settlement and billing.

Phase 6 is in progress. Its provider-independent money, credit allocation, pricing, billing, payment verification, tax, ledger, settlement, and reconciliation foundations are implemented, together with the financial schema and permission vocabulary. Live payment adapters, database repositories/migrations, complete worker fleet, billing consoles, and sandbox end-to-end certification remain release gates.

Phase 7 (Developer Platform & Operational Experience) is in progress. Secure webhook and privileged-access primitives, developer-domain schema/contracts, an initial TypeScript SDK/OpenAPI contract, and initial customer-console surfaces are implemented. Full SDK/CLI parity, persistence, exports, notifications/alerts, status/incidents, separate operations deployment, documentation, accessibility, contract tests, and developer-journey E2E remain release gates.

Phase 8 (Production Hardening & Private Beta Readiness) is in progress and is not a feature-completion substitute for Phases 6–7. Local fail-closed configuration checks, expanded security headers/redaction, a policy scan, and evidence-oriented threat/isolation/operations artifacts are present. Penetration, infrastructure, financial concurrency, load/stream/soak/chaos, restore/rollback/DR, alert, and production-candidate evidence remain launch blockers.
