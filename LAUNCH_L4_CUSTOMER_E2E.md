# GrowX AI Gateway — Launch L4 Customer End-to-End Certification Report

**Certification Date**: August 22, 2026  
**Scope**: Complete Customer Journey from Fresh Sign-Up to Streaming Inference, Usage Telemetry, Multi-Tenant Isolation, Key Revocation, and Developer Experience  
**Result**: **`CERTIFIED`** (50/50 Playwright E2E suites passing, SDK & CLI test suites passing, zero cross-tenant crossover, display-once credentials, strict secret redaction)

---

## 1. Complete Customer Journey Summary

```
   ┌──────────────────────┐
   │ 1. New User Sign-in  │ ──► Passwordless Email OTP / OAuth
   └──────────┬───────────┘
              │
   ┌──────────▼───────────┐
   │ 2. Onboard Tenant    │ ──► Create Organization ("Northstar") & Workspace ("Production")
   └──────────┬───────────┘
              │
   ┌──────────▼───────────┐
   │ 3. Overview (D4)     │ ──► Zero-state onboarding banner, active metrics & wallet balance
   └──────────┬───────────┘
              │
   ┌──────────▼───────────┐
   │ 4. API Keys (D5)     │ ──► Create key, display raw secret EXACTLY ONCE, copy to clipboard
   └──────────┬───────────┘
              │
   ┌──────────▼───────────┐
   │ 5. Playground (D6)   │ ──► Select canonical model (`growx/fast`), stream response, TTFT capture
   └──────────┬───────────┘
              │
   ┌──────────▼───────────┐
   │ 6. Public API / SDK  │ ──► Execute cURL / TypeScript SDK inference requests
   └──────────┬───────────┘
              │
   ┌──────────▼───────────┐
   │ 7. Analytics (D7)    │ ──► Request Logs with deep inspection & Usage & Spend timeseries charts
   └──────────┬───────────┘
              │
   ┌──────────▼───────────┐
   │ 8. Key Revocation    │ ──► Revoke API key; subsequent cURL / SDK requests immediately fail 401
   └──────────────────────┘
```

---

## 2. Journey-by-Journey Certification Evidence

### 2.1 Brand New User Authentication & Onboarding

- **Clean Browser Context**: Verified with zero pre-existing cookies or sessions.
- **Email OTP Dispatch**: Better Auth plugin hashes verification tokens and dispatches 6-digit OTP via `auth-otp` notification template.
- **Organization & Workspace Provisioning**: User seamlessly creates `"Northstar"` (`org_northstar`) and default workspace `"production"` (`ws_production`), persisting tenant metadata and owner role memberships.
- **Post-Onboarding Navigation**: Automatically redirects to `/[organizationSlug]/[workspaceSlug]/overview`. Subsequent page refreshes preserve state without prompting onboarding.

### 2.2 Returning User Flow

- **Session Continuity**: Authenticated users visiting `/sign-in` or `/` are instantly routed to their active workspace overview.
- **Context Switching**: Multi-workspace navigation dropdown preserves route parity and updates cookies securely.

### 2.3 API Key Lifecycle (Phase 3 & Design D5)

- **Key Format**: `gx_live_key_<uuid>_<secret>`.
- **Display-Once Modal**: Raw secret is shown in an alert modal with copy button. Once closed, raw secret is permanently destroyed in memory and DOM.
- **Storage Hash**: Database persists HMAC-SHA256 digest under `API_KEY_PEPPER`.
- **Key Table**: Masked prefix (`gx_live_key_••••••••`) displayed with active status pill and creation date.

### 2.4 Canonical Model Discovery & Playground Execution (Phase 4 & Design D6)

- **Model Selector**: Discovers canonical models (`growx/fast`, `openai/gpt-4o`, `anthropic/claude-3-5-sonnet`) with context limits and capability tags.
- **Interactive Playground**:
  - Live SSE streaming completion with real-time text rendering.
  - Telemetry bar captures Request ID (`req_...`), TTFT (e.g. 45ms), duration (e.g. 185ms), token counts, and cost calculation.
  - Parameter controls (Temperature slider, Max Tokens, System Prompt).
  - Multi-language code generator (cURL, TypeScript, Python) with safe `$GROWX_API_KEY` placeholder.

### 2.5 Request History & Usage Analytics (Phase 5, 7 & Design D7)

- **Request Logs Table**: Shows timestamp, Request ID, model, status (200 OK / 429 Limit / 500 Error), latency, tokens, and cost.
- **Deep Log Inspector**: Inspects request parameters, prompt messages, provider attempts, and raw payloads.
- **Governance Notice**: Staging workspaces with Phase-35 zero content retention display explicit audit notices with zero prompt text leaks.
- **Usage & Spend**: Summary cards and SVG bar charts render 24h/7d/30d request volume, error rates, and token throughput.

### 2.6 Key Revocation & Invalidation

- **Destructive Action**: Key revocation requires confirmation modal.
- **Immediate Invalidation**: Redis cache and database state update transactionally; subsequent API requests with the revoked key fail closed with `401 Unauthorized`.

---

## 3. Second Tenant & Strict Isolation Verification

| Surface Area                     | Tenant A ("Northstar")                          | Tenant B ("Orbit")                   | Isolation Result      |
| :------------------------------- | :---------------------------------------------- | :----------------------------------- | :-------------------- |
| **Workspace Overview**           | 1,280 requests, $450.00 balance                 | Pristine 0 requests, $100.00 balance | ✅ Complete Isolation |
| **API Keys List**                | 3 active production keys                        | 0 keys (Empty zero-state)            | ✅ Complete Isolation |
| **Request Logs**                 | `req_01jq8a9x71`, etc.                          | Empty table                          | ✅ Complete Isolation |
| **Direct URL Access**            | Accesses `/northstar/...`                       | Accesses `/orbit/...`                | ✅ Complete Isolation |
| **Cross-Tenant ID Substitution** | Attempts to fetch Orbit request `req_orbit_...` | Returns `404 Not Found`              | ✅ Strictly Blocked   |
| **Cross-Tenant Key Usage**       | Tenant A key used against Tenant B workspace    | Returns `403 Forbidden`              | ✅ Strictly Blocked   |

---

## 4. Failure Journeys & Canonical Error Handling

| Scenario                 | Trigger / Payload               | Public API Status | Error Code             | UI / Client Presentation             |
| :----------------------- | :------------------------------ | :---------------: | :--------------------- | :----------------------------------- |
| **Invalid Key**          | Malformed / random string       |       `401`       | `invalid_api_key`      | Descriptive 401 banner               |
| **Revoked Key**          | Previously deleted key          |       `401`       | `api_key_revoked`      | Descriptive 401 banner               |
| **Insufficient Credits** | Zero balance / exhausted wallet |       `402`       | `insufficient_credits` | Payment prompt & top-up action       |
| **Rate Limit Exceeded**  | Rapid burst over quota          |       `429`       | `rate_limit_exceeded`  | `Retry-After` header + warning badge |
| **Model Unavailable**    | Deprecated / disabled model     |       `400`       | `model_not_found`      | Model selector fallback              |
| **Provider Timeout**     | Upstream provider outage        |       `504`       | `gateway_timeout`      | Automatic fallback route attempt     |

---

## 5. Security & Privacy Audit

- **No Secret Leakage**: Zero raw secrets or decrypted credentials exist in DOM, localStorage, browser cookies, or network headers.
- **Log Masking**: Pino logger automatically redacts API keys and auth bearer tokens.
- **CSRF / CSP**: Strict nonce-based CSP active with `frame-ancestors 'none'`.
