# Developer Platform

Phase 7 turns the gateway into a self-service developer platform. Its trust boundaries are stricter than its user-interface boundaries.

## Security invariants

- Customer logs, usage, exports, webhooks, and service accounts are always scoped by both `organizationId` and `workspaceId` where workspace-owned.
- Webhook endpoints require HTTPS. Delivery resolves DNS immediately before connecting, rejects private, loopback, link-local, multicast, and metadata targets, pins the validated destination for the request, and does not follow redirects.
- Webhooks use HMAC-SHA-256 over `eventId.timestamp.rawBody`. Receivers must reject stale timestamps and persist event IDs to prevent replay.
- Webhook secrets are displayed once and stored encrypted. API/service-account credentials are displayed once and stored hashed.
- Export files use tenant-scoped, non-guessable object references and short-lived signed URLs.
- Request replay creates a new request ID and re-runs current authorization, model, routing, pricing, and credit checks. Side-effecting requests require explicit confirmation or are denied.
- `/internal/ops/*` accepts only dedicated privileged workforce sessions. Customer users, organization owners, API keys, and service accounts are always denied.
- Privileged sessions require strong authentication, explicit capabilities, a reason, scope, short expiry, and an available append-only audit sink. Sensitive content and high-risk actions require separate capabilities and step-up/approval.

## Developer contracts

The canonical public API is `openapi/growx-v1.yaml`. SDKs are thin clients and must not duplicate server policy. Automatic retries are limited to safe operations; streaming requests are never transparently restarted after output becomes visible. Every error exposes its request ID when available.

## Current release boundary

The repository currently contains the security domain foundations, Phase 7 schema/contracts, secure webhook delivery primitives, an initial TypeScript SDK, OpenAPI foundation, and initial console surfaces. Python/Go SDKs, CLI, complete console/ops/docs applications, export workers, concrete persistence and delivery adapters, JIT approval workflows, incident/status publishing, contract CI, and end-to-end certification remain required before Phase 7 is complete.
