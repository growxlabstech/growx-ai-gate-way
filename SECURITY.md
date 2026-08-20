# Security

## Phase 3 API keys

Keys use `gx_live_<keyId>_<secret>` or `gx_test_<keyId>_<secret>`. Secrets contain cryptographically secure random bytes and are revealed only by the creation/rotation response. Persistence contains an HMAC-SHA-256 digest under a server pepper of at least 32 bytes; validation uses constant-time comparison. Raw keys, authorization headers, hashes, and peppers are prohibited from logs, events, analytics, and caches.

Provider credentials stay server-side and are encrypted or injected from deployment secrets; admin APIs expose configuration status only. Raw prompts/responses are not persisted by default. Payload/message/tool/metadata limits are enforced before routing. Provider errors are redacted. Streaming honors backpressure and cancellation, and tool schemas are treated as untrusted input. Provider/model/routing/credential administration uses dedicated permissions and audit events.

Phase 5 routing mutations require centralized `routing.*`, `provider.*`, or `cache.manage` permissions. Customer preferences cannot override security, entitlement, disabled/maintenance state, capabilities, compliance, or hard budgets. Exact and semantic cache keys include tenant scope; sensitive cached values require encryption, TTL, retention, and access control. Circuit/capacity overrides require reason, confirmation, audit, and security events. Raw prompts never appear in routing analytics or traces.

Lookup uses the non-secret `keyId`. Revocation is transactional with its audit/outbox write and invalidates Redis immediately. Rotation creates a separate key and supports a bounded overlap policy. Authentication checks tenant and environment state, least-privilege scopes, deny-first model rules, validated IPv4/IPv6 CIDRs, strictest applicable limits, concurrency, and budget. Emergency revocation requires `apiKey.emergencyRevoke`, a reason, confirmation, audit and security events, and immediate invalidation.

## Phase 3 API keys

Keys use `gx_live_<keyId>_<secret>` or `gx_test_<keyId>_<secret>`. Secrets contain cryptographically secure random bytes and are revealed only by the creation/rotation response. Persistence contains an HMAC-SHA-256 digest under a server pepper of at least 32 bytes; validation uses constant-time comparison. Raw keys, authorization headers, hashes, and peppers are prohibited from logs, events, analytics, and caches.

Lookup uses the non-secret `keyId`. Revocation is transactional with its audit/outbox write and invalidates Redis immediately. Rotation creates a separate key and supports a bounded overlap policy. Authentication checks tenant and environment state, least-privilege scopes, deny-first model rules, validated IPv4/IPv6 CIDRs, strictest applicable limits, concurrency, and budget. Emergency revocation requires `apiKey.emergencyRevoke`, a reason, confirmation, audit and security events, and immediate invalidation.

All environment input is validated centrally. Secrets are supplied by the runtime and never committed. Web applications apply CSP, clickjacking, MIME sniffing, referrer, and permissions headers. Production ingress must terminate TLS and apply explicit CORS allowlists.

Authentication and authorization are separate boundaries. Sessions use secure, HTTP-only, same-site cookies; state-changing browser requests require CSRF protection. API keys are shown once, stored only as keyed hashes, scoped, rotated, and auditable. Sensitive data uses authenticated encryption helpers with keys from the secret manager.

Every request is schema validated and rate limited by principal and route. Logs redact credentials. Dependency and secret scanning should be required checks. Report vulnerabilities privately to the security owner; do not open public issues.

Better Auth sessions expire after 30 days and rotate daily; cookie caching is disabled so server checks see revocation immediately. Passwords require at least 12 characters and are hashed by the auth provider. Verification, reset, magic-link, and invitation tokens expire and are stored as hashes. OAuth account secrets are encrypted at rest.

Protected handlers call centralized permission evaluation after validating active account, organization, workspace, and membership states. Suspended/disabled users and suspended/archived tenants are denied regardless of role. Permission denials, cross-tenant attempts, repeated failed logins, expired-token reuse, session revocation, and suspension create security events.
# Better Auth compatibility invariant

Better Auth may operate with a logical session token, but GrowX AI must not persist raw session credentials. The database compatibility adapter derives the approved deterministic HMAC lookup representation before every session write or lookup. OAuth access, refresh, and ID tokens are AES-GCM encrypted at the same boundary. Stock session-list/token revocation routes are disabled because a protected database value must never be emitted as a bearer credential.
