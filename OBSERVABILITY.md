# Observability

Services emit structured JSON through `@growx/observability`; direct console logging is prohibited. Logs carry service, request ID, correlation ID, and trace ID. Sensitive fields are redacted at the logger boundary.

OpenTelemetry is the tracing and metrics transport. Prometheus collects requests, errors, latency, memory, CPU, and build/deployment signals; Grafana visualizes and alerts. Sentry captures actionable exceptions and Axiom stores searchable logs. Vendor keys are optional locally and required only in environments where the integration is enabled.

Alerts must describe impact, owner, and runbook. Avoid high-cardinality metric labels such as user IDs and request IDs.

Phase 2 spans authentication, organization/workspace creation, invitations, authorization decisions, database transactions, notification delivery, and admin actions. Required counters include login success/failure, registration, organization/workspace creation, invitation acceptance, and authorization denial. Latency histograms cover API, database, and email-delivery work.

Phase 3 adds `growx_gateway_requests_total`, `growx_gateway_auth_success_total`, `growx_gateway_auth_failure_total`, `growx_gateway_auth_duration_seconds`, `growx_gateway_rate_limit_total`, `growx_gateway_permission_denied_total`, `growx_gateway_budget_denied_total`, and key-cache hit/miss counters. The GrowX Gateway Access dashboard shows requests, auth outcomes, denial categories, latency, and cache ratio. Expected denials are metrics/security events, not Sentry exceptions.

Phase 4 traces gateway validation/model-resolution/routing, each provider attempt and stream, usage capture, and event publication. Metrics cover model success/failure, streams, latency/TTFT, provider errors/timeouts/fallback, model traffic, and input/output tokens. The “GrowX AI Gateway — Execution” dashboard reports RPS, success/error rates, P50/P95/P99, TTFT, providers/models, fallbacks, and tokens.

Phase 5 adds routing evaluation/policy/health/capacity/scoring/selection/fallback, circuit, and cache spans. Metrics include decisions and duration, selected providers/candidates, fallback/retry exhaustion, health score, circuit state, capacity utilization, cache hit ratio, and deduplication. Dashboards: Gateway Routing Overview, Provider Reliability, Provider Capacity, Fallback Analysis, and Cache Performance. Alerts cover unhealthy scores, opened circuits, fallback/429/timeout/latency spikes, near-limit capacity, cache failures, queue backlog, and routing failures.
