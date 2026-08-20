# GrowX Console App Shell Architecture

## Ownership

- `AppShell` is the server boundary used by organization and workspace pages.
- `loadTenantContext` reads the request cookie and calls the existing identity
  service `POST /v1/auth/context` contract with `cache: no-store`.
- `ConsoleShell` owns interactive shell UI only: route-aware navigation,
  organization/workspace selection, account menu, sign-out, and narrow-screen
  navigation.
- Page modules own their page title, optional description/action, and content.
- The admin application retains its separate `AdminShell` and operator
  navigation model.

## Tenant context flow

1. Console Proxy verifies that an authenticated session exists. This is an
   optimistic route gate only; backend services remain authoritative.
2. `AppShell` loads the authenticated user’s active organization memberships
   and workspace memberships from the identity service.
3. The organization slug and optional workspace slug in the URL are resolved
   only against those returned memberships.
4. Missing or unauthorized slugs fail with the not-found boundary before the
   customer shell renders. Empty membership redirects to the existing D3
   onboarding handoff.
5. Identity uncertainty renders a recoverable context error without showing
   previous tenant data.

## Workspace switching

- The URL is authoritative; no tenant authority is stored in localStorage.
- The switcher contains only active workspaces returned for the active
  organization.
- A valid workspace route suffix is preserved during a switch. Organization
  routes and unknown suffixes fall back to the destination workspace overview.
- Next navigation updates the full server-derived shell context. Refresh, deep
  links, back/forward, and new tabs therefore reconstruct context from the URL
  and server membership data.
- Current pages do not use a client query cache. Future tenant-scoped query keys
  must include organization and workspace identity and must invalidate or
  replace old data during switching.

## Session and sign-out

- The account menu receives authenticated user identity from the server context.
- Sign-out calls Better Auth’s real `/api/auth/sign-out` rewrite with cookies,
  then uses `location.replace('/sign-in')` so protected cached content is not
  presented as a valid current screen.

## Responsive and accessibility behavior

- Desktop uses a persistent independently scrolling sidebar and a single main
  content scroller.
- Narrow layouts use an off-canvas navigation drawer and backdrop.
- Escape closes the account menu or drawer and returns focus to its trigger.
- Navigation uses links and `aria-current`; switchers use labeled native
  selects; the page uses banner, navigation, complementary, and main landmarks.

## Security boundaries

- UI visibility is not authorization.
- Workspace selection never grants membership.
- Identity and context requests fail closed and are not cached.
- The console CSP uses a fresh request nonce following the Next.js 16 CSP
  pattern, allowing framework streaming without weakening production script
  policy.
- The current admin proxy does not expose an authoritative active-JIT lookup;
  D2 does not invent a replacement security protocol. This remains a blocker
  for certifying admin JIT expiry behavior.
