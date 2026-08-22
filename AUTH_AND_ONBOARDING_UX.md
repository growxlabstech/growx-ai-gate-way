# GrowX Authentication and Onboarding UX

## Scope

Design D3 consumes the Phase-1 Better Auth identity service and the D2 tenant context shell. It does not create a second session, identity, organization, or workspace model.

## Canonical account states

- `UNAUTHENTICATED`: no authoritative identity session.
- `AUTHENTICATED_NO_ORG`: session exists and context returns no active organization membership.
- `AUTHENTICATED_ORG_NO_WORKSPACE`: an active organization exists without an active workspace.
- `READY`: at least one active organization and workspace are available.

Authenticated states are derived from persisted context; no onboarding completion boolean is stored in the browser.

## Passwordless sign-in

`/sign-in` is canonical for new and returning users. Legacy sign-up, verification, and password-recovery routes normalize to the passwordless entry rather than maintaining duplicate form state.

1. Normalize the email and let the identity service perform authoritative validation.
2. POST `/api/auth/email-otp/send-verification-otp`.
3. Keep email and OTP only in component memory.
4. POST `/api/auth/sign-in/email-otp` when six digits are present.
5. Resolve `/api/auth/resolve`, which reads `/v1/auth/context` server-side.
6. Replace browser history with the authorized destination.

OTP errors distinguish invalid, expired, attempt-limited, rate-limited, unavailable, and unexpected states. Backend `Retry-After` is used when available. Visible cooldown is feedback only; backend policy remains authoritative.

## New and returning users

Returning users with an active workspace go to a validated internal `returnTo` route when it belongs to current memberships. Otherwise they enter their first active workspace overview.

New users enter `/onboarding`. The page re-resolves context on every request, so refreshes and browser restarts resume from persisted resources. `POST /v1/onboarding/organization` atomically creates the organization, owner membership and role, default workspace membership, development environment, audit record, and outbox event. Persisted context makes retries and simultaneous form submissions resolve to the already-created workspace. `POST /v1/onboarding/workspace` handles the derived organization-without-workspace state after permission evaluation.

## OAuth and invitations

Google and GitHub render only when the console deployment explicitly enables the provider. Identity owns credentials, state/CSRF, linking, callbacks, and session issuance. Callback failures use safe copy.

`/accept-invitation` preserves its safe continuation through authentication. `POST /v1/invitations/accept` hashes the supplied token, enforces expiry/revocation/single-use and email ownership, transactionally creates membership/role/workspace context, and appends audit/outbox records. Invalid, expired, used, and wrong-account invitations receive distinct safe responses.

## `returnTo` rules

- Accept only same-origin paths beginning with one `/`.
- Reject protocol-relative, absolute, backslash-containing, malformed, and cross-origin values.
- Require workspace paths to resolve to an active organization/workspace membership.
- Permit only the dedicated `/accept-invitation` continuation when it contains a bounded invitation token.
- Fall back safely when a deep link is unauthorized.

## Security, responsive, and accessibility rules

- Sessions remain in backend-issued cookies; OTP/session values are not written to browser storage, URLs, analytics, or frontend logs.
- Loading disables duplicate requests and OTP auto-submit is de-duplicated.
- Tenant uncertainty fails closed before D2 renders.
- Email uses native email/autocomplete semantics.
- OTP uses one labelled native input with numeric input mode, one-time-code autocomplete, paste support, decorative cells, and associated alerts.
- Focus moves to OTP after delivery and back to email after Change.
- Auth and onboarding reflow without horizontal overflow on narrow screens.
