# GrowX AI Gateway — Production Security & Governance

## 1. Zero-Trust Upstream Credential Vault (Phase 28)

Customer API keys authenticate callers _to_ GrowX; upstream provider credentials authenticate GrowX _to_ upstream AI providers (OpenAI, Anthropic, Google, etc.).

- **Master Key**: Upstream API keys are envelope-encrypted at rest using AES-256-GCM keyed by `PROVIDER_ENCRYPTION_KEY` (32 bytes).
- **Safe Fingerprinting**: Database records store write-only metadata and deterministic non-reversible fingerprints (`sk-...${last4}#${hash}`).
- **Just-In-Time (JIT) Resolution**: Decrypted credentials exist in volatile memory strictly inside `ProviderCredentialResolver` during provider request execution and are zeroed immediately upon completion.
- **Leakage Prevention**: Upstream provider credentials never cross into customer API responses, client bundles, browser storage, or logs.

---

## 2. Customer API Key Lifecycle (Phase 3)

- **Key Format**: `gx_live_<keyId>_<secret>` or `gx_test_<keyId>_<secret>`.
- **Display-Once Guarantee**: Raw secrets are returned exclusively in the creation/rotation response.
- **Storage**: Keys are stored as HMAC-SHA256 digests under `API_KEY_PEPPER` (min 32 bytes).
- **Lookup & Revocation**: Fast, non-secret lookups using `keyId`. Revocations are transactional and immediately purge cache entries in Redis.

---

## 3. Multi-Tenant Scoping & Data Retention (Phase 35)

- **Tenancy Boundary**: Every repository method requires `organization_id` and optional `workspace_id`. Cross-tenant queries fail closed with `404 / 403`.
- **Zero Content Retention**: Workspaces configured with Phase-35 zero retention never write prompt text or completion responses to persistent storage.

---

## 4. Production Security Headers & CORS Policy

- **Content-Security-Policy (CSP)**: Nonce-based strict script execution (`script-src 'self' 'nonce-...' 'strict-dynamic'`), disabling `unsafe-eval` and `unsafe-inline` in production.
- **Frame Ancestors**: `frame-ancestors 'none'` on all console and admin routes.
- **Cookies**: Auth session cookies are strictly `Secure`, `HttpOnly`, `SameSite=Lax`.
- **CORS**: Requires explicit HTTPS origins specified in `CORS_ALLOWED_ORIGINS`. Wildcards (`*`) are prohibited.
