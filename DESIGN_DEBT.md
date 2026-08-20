# GrowX AI Design Debt — D1

## P0 — broken interaction / unusable

- No unresolved foundational checkbox/capability-selection P0 remains in verified public surfaces.
- Authenticated tenant/admin screens remain unverified in a signed-in browser session; this is an evidence gap, not a correctness claim.

## P1 — major UX inconsistency

- Shell command search, profile menu, and context switchers are dead. Owner: D2.
- Onboarding does not create an organization. Owner: D3.
- API-key create/rotate/revoke are static. Owner: D5.
- Playground Run/Stop are static. Owner: D6.
- Usage range/export controls are static. Owner: D7.
- Admin resource actions/tables are static. Owner: D9.
- API-key detail tabs are non-semantic and non-interactive. Owner: D5.

## P2 — visual/design inconsistency

- Shared, console, and admin duplicate buttons, badges, tables, empty states, and switchers.
- App CSS carries parallel aliases for semantic tokens, radii, and typography.
- Console mobile navigation needs D2/D10 task-based validation.
- `/design/*` catalog routes duplicate entry points and are unavailable through normal unauthenticated flow.
- Shared Dropdown is a disclosure, not a complete menu primitive.

## P3 — polish

- Normalize real timestamps/request metadata when static examples are replaced.
- Review full-page screenshot duplication artifacts on unusually tall pages; DOM contained one group set.
- Run final 200% zoom and screen-reader testing in D10.
