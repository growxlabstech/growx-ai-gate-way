# GrowX AI Product Design Audit — D1

Date: 2026-08-20  
Scope: `apps/console`, `apps/admin`, and `packages/ui`  
Design phase: D1 only

## Audit method and evidence

- Inspected every `page.tsx`, both application shells, authentication components, privileged step-up, shared UI exports, tokens, and component CSS.
- Ran both applications locally and browser-captured the public authentication and privileged step-up screens.
- Mouse- and keyboard-tested privileged capability selection and ran automated interaction coverage.
- Authenticated tenant and privileged admin routes could not be fully exercised without a real session. Source classification for those routes is explicit and is not presented as browser certification.

Evidence:

- `reports/design-d1/screenshots/01-console-sign-in.png`
- `reports/design-d1/screenshots/02-admin-step-up.png`
- `reports/design-d1/screenshots/03-admin-capability-selected.png`
- `reports/design-d1/screenshots/04-console-sign-in-mobile.png`

The evidence sequence and verification notes are recorded in
`reports/design-d1/AUDIT_EVIDENCE.md`.

## Product-wide findings

### Strengths

- Authentication and privileged step-up strongly express Obsidian × Ice × Frost without becoming neon or generic SaaS.
- Tokens already separate canvas, shell, primary, raised, hover, text hierarchy, borders, semantic status, spacing, radii, and motion.
- Manrope and JetBrains Mono establish a recognizable product voice; no font replacement is justified in D1.
- Authentication and step-up use direct copy, bounded forms, focus states, and duplicate-submission prevention.
- Shared data, feedback, overlay, and control primitives cover most required foundation categories.

### Foundational issues repaired in D1

- Custom checkbox/radio/switch focus previously landed on a visually hidden input without a reliable ring on its visible indicator.
- Disabled choice controls lacked a clear label/indicator treatment.
- Tabs exposed tab semantics but lacked Arrow Left/Right, Home, and End navigation.
- Modal/flyout dialogs were not reliably associated with their visible title.
- UI tests could not run reliably on Node 24 with `jsdom@30`; D1 pins a compatible environment.

### Later-phase issues not implemented in D1

- Many tenant/admin pages are static or partial shells with dead Create, Filter, Export, Rotate, Revoke, Run, and menu controls.
- Shell search, profile, context switching, and mobile navigation are not fully connected to application state.
- Most operational pages have no real loading, error, mutation, or success lifecycle.
- Several screens use mock rows or static metrics.
- API-key detail uses visual spans as tabs.
- The model picker is a native select foundation, not the final searchable D5 experience.

## Console route status and backend matrix

| Route                                                                                                                       | Primary job                 | Status  | Backend          | Key interaction/state note                                    | Owner |
| --------------------------------------------------------------------------------------------------------------------------- | --------------------------- | ------- | ---------------- | ------------------------------------------------------------- | ----- |
| `/`                                                                                                                         | Resolve initial destination | WORKING | NO_DATA_REQUIRED | Server redirect                                               | D2    |
| `/sign-in`                                                                                                                  | Authenticate                | WORKING | REAL_BACKEND     | Loading, validation, denial, OTP                              | D3    |
| `/sign-up`                                                                                                                  | Create identity             | WORKING | REAL_BACKEND     | Real auth state machine                                       | D3    |
| `/forgot-password`                                                                                                          | Request recovery            | PARTIAL | REAL_BACKEND     | Delivery not verified in D1                                   | D3    |
| `/reset-password`                                                                                                           | Complete recovery           | PARTIAL | REAL_BACKEND     | Token lifecycle not browser-certified                         | D3    |
| `/verify-email`                                                                                                             | Verify challenge            | PARTIAL | REAL_BACKEND     | OTP UI real; delivery not verified                            | D3    |
| `/onboarding`                                                                                                               | Create org/workspace        | WORKING | REAL_BACKEND     | Transactional, resumable, idempotent                          | D3    |
| `/select-organization`                                                                                                      | Choose tenant               | STATIC  | STATIC_DATA      | Search/Create dead; link works                                | D2/D3 |
| `/[org]/overview`                                                                                                           | Review org state            | STATIC  | STATIC_DATA      | Generic dead actions                                          | D4    |
| `/[org]/workspaces`                                                                                                         | Find/create workspaces      | PARTIAL | STATIC_DATA      | Filters render; no filtering/mutation                         | D4/D9 |
| `/[org]/members`                                                                                                            | Manage members              | WORKING | REAL_BACKEND     | RBAC roles, invites, last-owner safety                        | D9    |
| `/[org]/invitations`                                                                                                        | Manage invitations          | WORKING | REAL_BACKEND     | Pending invites, revoke flow                                  | D9    |
| `/[org]/teams`                                                                                                              | Manage teams                | WORKING | REAL_BACKEND     | Team access scopes                                            | D9    |
| `/[org]/audit`                                                                                                              | Inspect org audit           | WORKING | REAL_BACKEND     | Organization audit stream                                     | D9    |
| `/[org]/settings`                                                                                                           | Configure org               | WORKING | REAL_BACKEND     | Profile, canonical ID, governed delete                        | D9    |
| `/[org]/[workspace]/overview`                                                                                               | Monitor gateway             | PARTIAL | MOCK_DATA        | Static metrics/provider rows                                  | D4    |
| `/[org]/[workspace]/playground`                                                                                             | Execute model request       | STATIC  | STATIC_DATA      | Inputs work; Run/Stop dead                                    | D6    |
| `/[org]/[workspace]/models`                                                                                                 | Browse models               | PARTIAL | MOCK_DATA        | Static rows/detail links                                      | D5    |
| `/[org]/[workspace]/models/[modelId]`                                                                                       | Inspect model               | PARTIAL | MOCK_DATA        | Static metadata                                               | D5    |
| `/[org]/[workspace]/api-keys`                                                                                               | List/create keys            | PARTIAL | MOCK_DATA        | Static row; navigation works                                  | D5    |
| `/[org]/[workspace]/api-keys/new`                                                                                           | Configure key               | STATIC  | STATIC_DATA      | Controls work locally; submit dead                            | D5    |
| `/[org]/[workspace]/api-keys/[apiKeyId]`                                                                                    | Manage key                  | STATIC  | STATIC_DATA      | Fake tabs; Rotate/Revoke dead                                 | D5    |
| `/[org]/[workspace]/logs`                                                                                                   | Inspect requests            | PARTIAL | MOCK_DATA        | Static request table/inspector                                | D7    |
| `/[org]/[workspace]/usage`                                                                                                  | Analyze usage               | STATIC  | STATIC_DATA      | Range/export dead                                             | D7    |
| `/[org]/[workspace]/analytics/routing`                                                                                      | Analyze routing             | PARTIAL | MOCK_DATA        | Static metrics/chart/table                                    | D7    |
| `/[org]/[workspace]/billing`                                                                                                | Review credits/invoices     | WORKING | REAL_BACKEND     | Authoritative wallet, spend, transactions, invoices, checkout | D8    |
| `/[org]/[workspace]/environments`                                                                                           | Manage environments         | WORKING | REAL_BACKEND     | Environment boundaries                                        | D9    |
| `/[org]/[workspace]/members`                                                                                                | Manage workspace members    | WORKING | REAL_BACKEND     | Workspace memberships                                         | D9    |
| `/[org]/[workspace]/service-accounts`                                                                                       | Manage service identities   | WORKING | REAL_BACKEND     | Service identity scopes                                       | D9    |
| `/[org]/[workspace]/webhooks`                                                                                               | Manage endpoints            | WORKING | REAL_BACKEND     | HTTPS, display-once secret, test ping                         | D9    |
| `/[org]/[workspace]/settings`                                                                                               | Configure workspace         | WORKING | REAL_BACKEND     | Phase-35 retention, governed delete                           | D9    |
| `/design/all`                                                                                                               | Internal component catalog  | LEGACY  | NO_DATA_REQUIRED | Reference surface, not production UX                          | D10   |
| `/design/{buttons,cards,charts,colors,developer,forms,icons,motion,navigation,overlays,status,tables,templates,typography}` | Focused catalog view        | LEGACY  | NO_DATA_REQUIRED | Duplicate entry routes                                        | D10   |

Health routes are operational endpoints, not product screens.

## Admin route status and backend matrix

| Route                       | Primary job                | Status  | Backend          | Key interaction/state note              | Owner |
| --------------------------- | -------------------------- | ------- | ---------------- | --------------------------------------- | ----- |
| `/`                         | Enter privileged plane     | WORKING | NO_DATA_REQUIRED | Redirect                                | D2    |
| `/admin`                    | Enter first resource       | WORKING | REAL_BACKEND     | Operations Overview & high-signal KPIs  | D9    |
| `/admin/step-up`            | Request scoped JIT session | WORKING | REAL_BACKEND     | Real validation/payload/denial/success  | D9    |
| `/admin/users`              | Inspect users              | WORKING | REAL_BACKEND     | User search, MFA, suspension            | D9    |
| `/admin/organizations`      | Inspect organizations      | WORKING | REAL_BACKEND     | Tenant search, spend, status            | D9    |
| `/admin/workspaces`         | Inspect/create workspaces  | WORKING | REAL_BACKEND     | Workspace search, retention, quotas     | D9    |
| `/admin/audit-events`       | Inspect privileged audit   | WORKING | REAL_BACKEND     | Immutable SHA-256 hash-chained log      | D9    |
| `/admin/security-events`    | Inspect security events    | WORKING | REAL_BACKEND     | Automated security signals & severity   | D9    |
| `/admin/models`             | Manage model catalog       | WORKING | REAL_BACKEND     | Model Registry, emergency kill switch   | D9    |
| `/admin/providers`          | Manage providers           | WORKING | REAL_BACKEND     | Latency, circuit breakers, drain mode   | D9    |
| `/admin/providers/health`   | Inspect provider health    | WORKING | REAL_BACKEND     | Health metrics, circuit breaker states  | D9    |
| `/admin/providers/capacity` | Inspect capacity           | WORKING | REAL_BACKEND     | Multi-account quota pooling             | D9    |
| `/admin/providers/circuits` | Manage circuits            | WORKING | REAL_BACKEND     | Circuit trips and half-open probes      | D9    |
| `/admin/routing`            | Inspect routing            | WORKING | REAL_BACKEND     | Router V2 policy orchestration          | D9    |
| `/admin/routing/policies`   | Manage policies            | WORKING | REAL_BACKEND     | Strategy weights & hysteresis penalties | D9    |
| `/admin/routing/traffic`    | Inspect allocation         | WORKING | REAL_BACKEND     | Dynamic weights & canary splitting      | D9    |
| `/admin/cache`              | Inspect cache              | WORKING | REAL_BACKEND     | Exact & semantic cache hit metrics      | D9    |

## Interaction foundation

| Foundation     | Result             | Evidence / limitation                                          |
| -------------- | ------------------ | -------------------------------------------------------------- |
| Checkbox       | WORKING            | Label/Space unit test; step-up pointer E2E                     |
| Radio          | WORKING            | Native exclusive value test                                    |
| Button loading | WORKING            | Disabled/`aria-busy` test and step-up E2E                      |
| Native select  | WORKING            | Native semantics and emitted values                            |
| Combobox       | PARTIAL            | Styled select alias; searchable behavior belongs to D5         |
| Tabs           | WORKING FOUNDATION | Arrow keys, Home, End added/tested                             |
| Dialog/flyout  | WORKING FOUNDATION | Naming, focus trap, Escape, return focus                       |
| Dropdown/menu  | PARTIAL            | Disclosure opens; full menu API deferred                       |
| Table          | WORKING FOUNDATION | Search/sort/select/loading/empty/error/pagination/row keyboard |
| Navigation     | PARTIAL            | Links work; search/profile/switchers dead                      |

## Accessibility and responsive baseline

- Fixed custom-choice focus and disabled styling, dialog names, and tab keyboard movement.
- Preserved semantic inputs, selects, choices, tables, buttons, and reduced-motion behavior.
- Console reflows below 768px; admin uses a mobile sidebar; authentication becomes single-column.
- Authenticated shells remain an evidence gap for zoom and screen-reader certification.

## D2–D10 ownership map

- **D2:** app shells, navigation, command search, menus, context switchers, mobile shell.
- **D3:** authentication, onboarding, organization selection.
- **D4:** organization/workspace overviews.
- **D5:** API keys, models, searchable model selection.
- **D6:** playground and streaming lifecycle.
- **D7:** logs, usage, analytics, exports.
- **D8:** billing, credits, invoices.
- **D9:** tenant settings/membership/audit/operations and all privileged admin routes.
- **D10:** cross-product UX, legacy catalog disposition, responsive/zoom/AT certification.

## D1 verdict

D1 foundation work is implemented and verified where access permits. The
production builds, scoped lint/type checks, shared foundation tests, and six
privileged step-up interaction tests pass. Authenticated console and privileged
resource screens still require a valid session/backend for browser
certification, while their source-level status and later-phase owners are
recorded above. Feature-complete route behavior remains intentionally assigned
to D2–D10.

## D2 resolution — app shell and workspace context

- Replaced hardcoded organization, workspace, and profile values with the real
  identity-service context contract.
- Added server membership resolution for every shell render; unauthorized
  organization/workspace slugs fail before the shell renders.
- Added real organization/workspace selectors, URL-preserving workspace
  switching, active/nested route state, real account identity, and real
  Better Auth sign-out.
- Removed the decorative command trigger and fake admin operator/environment
  footer content.
- Repaired the console CSP so Next.js streaming uses per-request nonces instead
  of remaining permanently on the loading boundary.
- Added responsive drawer, Escape focus return, controlled scroll ownership,
  context failure state, and real organization-selection data.
- Evidence is recorded in `reports/design-d2/AUDIT_EVIDENCE.md`.

Remaining D2 certification blocker: the admin proxy claims to require a JIT
session but currently validates only the base user session, and the identity
service exposes no authoritative current-JIT lookup for the shell/proxy. D2 did
not invent or weaken that backend security protocol.

## D3 resolution — authentication and first-run

- Consolidated new and returning users on Better Auth passwordless email and normalized duplicate legacy auth routes.
- Added OTP auto-submit, paste/native keyboard behavior, focus transitions, invalid/expired/attempt/rate-limit presentation, Retry-After handling, resend feedback, Change email, and duplicate-request protection.
- Added one server-side resolver for persisted account state, membership-authorized deep links, onboarding resumability, and safe fallback.
- Existing valid sessions skip authentication; completed users cannot re-enter onboarding; expired sessions return protected routes to sign-in.
- OAuth is configured-only and provider failures are sanitized.
- Confirmed no production browser storage, logging, URL, or deterministic OTP bypass in console/identity production sources.
- Removed the static onboarding form because it could not persist resources.

D3 completion: the authenticated identity edge exposes the existing Phase-2 transactional organization/workspace application, and email-bound invitation acceptance is wired with single-use claiming, authorization, audit, and outbox persistence. Production UI contains no test OTP or auth bypass.
