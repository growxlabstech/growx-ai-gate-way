# Service Ownership

Phase 4 ownership: Gateway Service owns request execution and streaming; Routing Service owns routing decisions; Model Registry owns model metadata and aliases; Provider Service owns provider configuration, credentials, adapters, and health; Usage Ingestion owns request, attempt, token, latency, cost-input, and error telemetry ingestion.

Phase 5 ownership: Routing Service owns immutable policies and decisions; Provider Service owns capacity and connection pools; Provider Health Worker owns health calculations/snapshots; Usage Service owns usage truth; Analytics Service owns ClickHouse aggregates; cache storage owns only tenant-scoped reusable responses and in-flight coordination.

| Area | Services | Initial owner |
| --- | --- | --- |
| Identity and access | identity, organization, workspace, authorization, api-key | Platform |
| AI gateway | gateway, routing, provider, model-registry | AI Platform |
| Metering and commerce | usage, usage-ingestion, billing, credit, payment | FinOps |
| Platform operations | analytics, notification, audit, storage, webhook, feature-flag | Platform |

Owners approve contract and schema changes, maintain alerts and runbooks, and lead incident response. Replace team placeholders with named on-call rotations before production launch.
# Authentication delivery ownership

The identity service creates and validates Better Auth OTP/session state. It submits email work to the notification service; the notification service owns rendering and Resend delivery. In production, `RESEND_API_KEY` and `RESEND_FROM_EMAIL` are both required for delivery. No service logs OTP values.
