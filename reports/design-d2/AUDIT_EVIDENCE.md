# D2 Browser Evidence

Date: 2026-08-20

1. `01-console-shell-desktop.png` — authenticated desktop shell with real
   identity-contract organization, workspace, and user values. Active route is
   communicated by surface, weight, marker, and `aria-current`.
2. `02-workspace-switched.png` — workspace changed from Production Gateway to
   Staging Gateway while preserving the workspace overview suffix. The previous
   workspace name is absent from the active context.
3. `03-account-menu.png` — account menu shows server-derived name/email and only
   real settings and sign-out actions.
4. `04-mobile-navigation.png` — 390×844 drawer with usable context selectors,
   route links, independent scrolling, backdrop, and Escape focus return.

Automated browser coverage also verifies Models → API keys → Usage navigation,
refresh persistence, sign-out, protected-route back navigation, and rejection
of a workspace URL outside the second tenant fixture’s memberships.
