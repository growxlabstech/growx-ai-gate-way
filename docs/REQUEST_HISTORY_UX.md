# GrowX AI Gateway — Request History & Explorer UX Specification (D7)

## 1. Executive Summary & Objective

The Request History & Explorer (`/[organizationSlug]/[workspaceSlug]/logs`) enables developers, platform engineers, and operators to inspect every inference request routed through the GrowX AI Gateway. It provides authoritative, real-time observability over model routing decisions, execution latencies, token consumption, settled costs, and diagnostic error classifications without exposing provider credentials or raw customer secrets.

---

## 2. Information Architecture & Navigation

```
Workspace Root (/[organizationSlug]/[workspaceSlug])
│
├── Usage & Spend (/usage)
│   └── High-level workspace aggregate trends & consumption over time
│
├── Request Logs (/logs)
│   ├── Compact table of all recorded workspace executions
│   ├── Server-side filtering (Model, Status, Time Range, Search)
│   └── Cursor pagination
│
└── Request Detail (/logs/:requestId)
    ├── Deep inspection of a single execution
    ├── High-density metrics bar (Duration, TTFT, Tokens, Settled Cost)
    ├── Governance-aware Prompt & Response content
    ├── Error diagnostics (Canonical taxonomy, retryability)
    └── Provider attempt breakdown & raw JSON payloads
```

---

## 3. Request Table Specification

### Columns

1. **Timestamp**: Relative human time (e.g. `45s ago`) with full ISO UTC timestamp on hover.
2. **Request ID**: Monospace format (`req_01jq8a9x71`), copyable with 1-click clipboard feedback, deep link to `/logs/:requestId`.
3. **Model**: Canonical model badge (e.g. `openai/gpt-4o`, `anthropic/claude-3-5-sonnet`, `growx/fast`).
4. **Status**: Canonical status badge:
   - `SUCCEEDED` (200): Emerald Frost
   - `FAILED` (4xx/5xx): Crimson Frost
   - `RATE_LIMITED` (429): Amber Orange
   - `CANCELLED` (499): Warning Amber
   - `PROCESSING`: Ice Cyan Pulse
5. **Duration**: Total roundtrip latency in milliseconds.
6. **TTFT**: Time to first token in milliseconds (`—` if non-streaming or failed).
7. **Tokens**: Total token volume (with tooltip showing input vs output split).
8. **Settled Cost**: Authoritative Phase-16 pricing record (e.g. `$0.00310`).
9. **Action**: `Inspect →` button linking to deep request detail.

---

## 4. Server-Side Filtering & URL State

- **Search**: Case-insensitive prefix/substring match on Request ID or Model Name.
- **Model Filter**: Filter by any active model registered in the Workspace Model Registry.
- **Status Filter**: `All`, `Succeeded`, `Failed`, `Rate Limited`, `Cancelled`.
- **Time Range Filter**: `24h`, `7d`, `30d`, `90d`.
- **URL Synchronization**: Active filters are synced to search parameters (e.g. `?status=failed&model=openai/gpt-4o&range=7d`) enabling bookmarkable and shareable views without storing secrets in URLs.

---

## 5. Phase-35 Data Governance & Content Retention

- **Standard Retention Workspaces** (e.g. Production): Prompt messages and assistant responses are rendered safely with syntax-highlighted markdown and code copy buttons.
- **Zero-Retention Workspaces** (e.g. Staging / Regulated): Raw prompt and response content is never retained on disk or rendered in the UI. A clear governance banner is shown:
  > _"Prompt and response content was not retained for this workspace per data retention policy. Metadata, execution metrics, and settled billing records are preserved."_

---

## 6. Multi-Tenant Security & Isolation

- **Workspace Scoping**: Every database and API query is strictly scoped to `(organizationId, workspaceId)`.
- **Cross-Tenant Prevention**: Attempting to load a request ID belonging to Workspace A under Workspace B results in an immediate `404 Not Found` with zero metadata leaked.
- **Zero Provider Secret Leakage**: Upstream provider API keys, secret vault references, internal endpoint URLs, and proprietary scoring weights are never exposed in customer-facing logs or request details.
