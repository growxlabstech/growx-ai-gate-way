# UI/UX Guidelines

Reusable tokens and primitives belong in `@growx/ui`; applications compose them into pages. The package boundary covers color, typography, spacing, motion, themes, icons, forms, tables, overlays, command interactions, cards, buttons, and loading states.

Interfaces must support keyboard navigation, visible focus, semantic HTML, reduced motion, sufficient contrast, clear validation, and useful empty/error/loading states. Do not encode meaning with color alone. Product copy should be direct, specific, and action oriented.

No production page system is implemented in Phase 1.

Phase 2 control-plane pages use a persistent organization/workspace shell, visible tenant context, breadcrumbs, and explicit environment badges. Every data surface provides loading, empty, error, permission-denied, not-found, success-feedback, and responsive states. Destructive membership, session, and lifecycle actions require confirmation and describe impact before submission.

Phase 4 playground execution uses server-side authenticated actions, streams progressively, exposes stop/cancel, and shows request ID, latency, and token usage. Model/catalog/log surfaces never reveal provider credentials, API-key secrets, prompt content, or internal routing secrets. Provider credential forms show configured/rotation state only.
