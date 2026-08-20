# GrowX AI UI/UX Guidelines

This is the authoritative D1 design and interaction foundation. Reusable tokens and primitives belong in `@growx/ui`; applications compose product-specific flows.

The D2 shell rules below extend this authority without replacing D1.

## Application shell and tenant context

- Use one canonical customer `AppShell`; pages provide content and page-header
  inputs instead of recreating sidebars, switchers, account menus, or chrome.
- Derive user, organization, and workspace values from authenticated server
  context. Never display placeholder tenant or profile values.
- The organization/workspace URL is authoritative. Client state may mirror a
  pending visual selection but never grants access.
- Workspace options include only active memberships returned by the backend.
- Tenant uncertainty fails closed without retaining previous-tenant content.
- Customer and operator navigation remain visibly and structurally separate.

## Sidebar and navigation

- Group routes by user job: Home, Build, Observe, Workspace, Organization.
- Include only real routes. Navigation uses links and preserves browser link,
  deep-link, new-tab, refresh, and back/forward semantics.
- Active state combines surface, weight, structure, and `aria-current`; Ice
  alone is insufficient.
- Desktop owns one sidebar scroller and one main-content scroller. Narrow
  layouts use an off-canvas drawer rather than compressed desktop navigation.

## Workspace switcher and account menu

- Use labeled native selects for the bounded D2 organization/workspace lists.
- Preserve valid workspace route suffixes during a switch and fall back to the
  workspace overview for invalid or organization-only suffixes.
- Account menus show only authenticated identity data and working actions.
- Escape closes transient shell overlays and returns focus to their trigger.
- Sign-out calls the real session endpoint and replaces browser history with
  the public sign-in destination.

## Page header and content region

- Page headers support a concise title, optional description, and contextual
  actions. Do not repeat navigation or use marketing-scale copy.
- Use operational max widths while allowing technical tables and inspectors to
  use the available canvas.
- Prefer `100dvh`/`100svh` over brittle `100vh` for interactive app frames.

## Product principles

- Preserve the product. One page has one primary job.
- GrowX is premium, cold, precise, quiet, technical, developer-focused, and infrastructure-grade.
- Use direct copy. Avoid marketing language and unnecessary explanatory text.
- Technical density is acceptable when hierarchy, compact rows, tables, and progressive disclosure keep the task clear.
- Visible controls must work. Certify click, keyboard, state, visual feedback, disabled behavior, and emitted value.

## Obsidian × Ice × Frost

- **Obsidian:** canvas, shell, primary, raised, hover, active, elevated, and overlay separation. Do not use pure black for every layer.
- **Ice:** focus, active navigation, important selection, small highlights, and appropriate data emphasis. Do not make whole pages or every border blue.
- **Frost:** primary, secondary, supporting, muted, disabled, and metadata text. Avoid warm gray.
- No neon, glow-heavy, cyberpunk, gaming, cartoon, or generic SaaS styling.

## Typography

- Sans: Manrope with system fallback through `--gx-font-sans`.
- Mono: JetBrains Mono with platform fallbacks through `--gx-font-mono`.
- Use display/page/section/panel/body/dense/label/metadata/micro/code roles.
- Use mono for keys, IDs, request/model IDs, JSON, code, and technical values.
- Use tabular numerals for currency, tokens, usage, and latency.

## Spacing and layout

- Use the 4px-based `--gx-space-1` through `--gx-space-12` scale.
- Page spacing exceeds section spacing; section spacing exceeds control/inline spacing.
- Operational, form, and full-width screens use their appropriate container roles.

## Surfaces, borders, and radii

- Hierarchy: Canvas → Shell → Primary → Raised → Hover/Active → Overlay.
- Use subtle borders for grouping, default for controls, strong for emphasis/overlays.
- Prefer sections, rows, or tables over unnecessary cards.
- Use xs/sm/md/lg/xl radii. Reserve pills for compact status/filter tokens.

## Buttons

- Variants: primary, secondary, ghost/quiet, danger, link.
- Require default, hover, active, focus-visible, disabled, and loading states.
- Loading disables duplicate submission and exposes `aria-busy`.
- Icon-only buttons require an accessible name and tooltip when unclear.

## Inputs and forms

- Order: label → control → optional helper → validation.
- Support default, hover, focus, filled, invalid, disabled, and read-only.
- Associate useful validation and recovery text with the field.

## Checkbox, radio, and selection

- Checkbox is multi-select; radio is mutually exclusive; switch is binary state.
- Labels are hit targets. Space toggles a focused native choice.
- Indicators visibly show focus, selected, disabled, and checked-disabled.
- Visual state, application state, and submitted value share one source of truth.
- Final searchable model selection belongs to D5; D1 `Combobox` remains a native select foundation.

## Selects and comboboxes

- Use Select for short choices and a true combobox for searchable technical data.
- Comboboxes cover Arrow keys, Enter, Escape, focus, selection, disabled options, and empty results.

## Tabs and navigation

- Tabs represent related views, not arbitrary application navigation.
- Tab lists support Arrow Left/Right, Home, End, visible focus, and restrained selection.
- Consumers own active state and associated panels.
- Navigation exposes current page and tenant/workspace context.

## Menus, dialogs, and drawers

- Menus require keyboard navigation, Escape, focus, and selection behavior.
- Dialogs require an accessible title, focus entry/trap, Escape where safe, focus restoration, and explicit destructive consequences.
- Drawers preserve page context; not every detail view is a drawer.

## Tables and technical data

- Use compact professional density with hover, selected, loading, empty, error, pagination, and row actions.
- Mask persisted secrets. Secret values may be shown once and copied, never redisplayed in full.

## Status and async feedback

- Vocabulary: Active, Disabled, Pending, Processing, Succeeded, Failed, Degraded.
- Never rely on color alone.
- Use honest skeleton/spinner/progress/streaming states; never fake percentages.
- Empty states answer what, why, and next action. Errors state what failed and safe recovery.
- Prefer inline success. Critical information must not exist only in a toast.

## Motion

- Use subtle bounded motion for overlays, menus, selection, loading, and streaming.
- Respect `prefers-reduced-motion`; avoid constant decoration and heavy dependencies.

## Accessibility

- Use semantic HTML first and ARIA only when needed.
- Every control has visible focus, logical order, labels, keyboard operation, contrast, disabled semantics, and error recovery.
- Dialogs trap/restore focus. Icon-only controls have accessible names.
- Do not claim compliance without keyboard, zoom, contrast, screen-reader, and responsive evidence.

## Responsive behavior

- Preserve the primary job across desktop, laptop, tablet, and narrow viewports.
- Reflow rather than squeeze. Tables may scroll; forms become one column; primary actions remain visible.
- D10 owns final cross-product responsive and assistive-technology certification.

## Security-sensitive UI

- Authentication is never authorization.
- Never display, log, or persist raw API/provider keys, session tokens, or sensitive payloads.
- Privileged actions show scope, reason, expiration, approval, and break-glass risk while backend enforcement remains authoritative.
- Destructive/financial actions fail closed when authorization or audit durability is uncertain.
