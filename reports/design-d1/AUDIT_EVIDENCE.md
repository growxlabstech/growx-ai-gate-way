# D1 Browser Evidence

Date: 2026-08-20

1. `01-console-sign-in.png` — desktop sign-in at 1920×1080. Healthy Obsidian ×
   Ice × Frost composition, readable form hierarchy, working route, and no
   visible overflow.
2. `02-admin-step-up.png` — desktop privileged step-up. All five semantic
   capability groups render in the natural page flow without an inner scroll
   region.
3. `03-admin-capability-selected.png` — pointer-selected provider capability.
   The full tile toggles, `aria-checked` changes to `true`, and the compact Ice
   selected treatment remains visible.
4. `04-console-sign-in-mobile.png` — sign-in at 390×844. The layout becomes a
   single column, OAuth actions stack, and the form remains usable without
   horizontal overflow.

Authenticated tenant screens redirect to sign-in without a valid session.
Their D1 status is therefore source-audited rather than represented as browser
certification. Privileged capability keyboard behavior and exact submission
semantics are covered by the six Playwright tests in
`apps/admin/tests/step-up.spec.ts`.
