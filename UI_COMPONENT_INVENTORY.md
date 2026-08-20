# GrowX AI UI Component Inventory — D1

`packages/ui` is the canonical owner for reusable visual and interaction foundations. App-local components remain appropriate when they encode a security or product flow that is not safe to generalize.

| Foundation                 | Canonical location                                | Variants / behavior                                                   | Duplicate / status                                                        |
| -------------------------- | ------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Button / IconButton        | `packages/ui/src/components/controls.tsx`         | primary, secondary, ghost, danger, link; xs–lg; loading               | Console/admin native styles duplicate it; canonical WORKING               |
| Input family               | `controls.tsx`                                    | text, search, password, number, textarea, select                      | App-native fields remain; canonical WORKING                               |
| Checkbox / Radio / Switch  | `controls.tsx`                                    | native semantics with custom indicators                               | Console permission editor duplicates Checkbox; WORKING after D1 focus fix |
| Combobox                   | `controls.tsx`                                    | currently styled native Select                                        | PARTIAL; searchable implementation belongs to D5                          |
| Segmented control          | `controls.tsx`                                    | pressed buttons                                                       | WORKING primitive; consumer owns state                                    |
| Tabs                       | `navigation.tsx`                                  | selected state and roving keyboard focus                              | API-key detail duplicates with spans; canonical WORKING                   |
| Pagination                 | `navigation.tsx`                                  | previous/next, disabled, live page label                              | WORKING                                                                   |
| Context switchers          | `navigation.tsx`                                  | org/workspace/environment selects                                     | Console shell duplicates; D2 consolidation                                |
| Dropdown                   | `overlays.tsx`                                    | native details disclosure                                             | PARTIAL menu semantics                                                    |
| Modal / AlertDialog        | `overlays.tsx`                                    | sm/md/lg, focus trap, Escape, return focus, naming                    | WORKING after D1                                                          |
| Flyout / Sheet             | `overlays.tsx`                                    | standard/technical/large                                              | WORKING after D1                                                          |
| Toast                      | `overlays.tsx`                                    | information, health, warning, critical                                | WORKING                                                                   |
| Table                      | `data.tsx`                                        | compact responsive wrapper                                            | Console/admin native tables duplicate it                                  |
| DataTable                  | `data-table.tsx`                                  | search, sort, select, loading, empty, error, pagination, keyboard row | Canonical interactive table                                               |
| Badge/status               | `status.tsx`                                      | neutral, ice, health, warning, critical, information                  | Console/admin badges duplicate it                                         |
| Loading/error/empty        | `feedback.tsx`                                    | skeleton, spinner, loading, empty, error, retry, permission, offline  | App StatePanel/AdminTable duplicate it                                    |
| Card/panel/callout         | `surfaces.tsx`                                    | standard, summary, action, interactive                                | App-local state cards duplicate styling                                   |
| Generic shell/navigation   | `navigation.tsx`                                  | shell, topbar, sidebar, breadcrumb                                    | Product shells remain local until D2                                      |
| Auth controls              | `apps/console/src/components/auth-primitives.tsx` | OTP, OAuth, loading submit, auth fields                               | Correct auth-flow owner                                                   |
| Privileged capability tile | `apps/admin/src/app/admin/step-up/page.tsx`       | scoped checkbox multi-select                                          | Correct security-flow owner                                               |

## Duplicate summary

- Three button styling systems: shared, console-native, admin-native.
- Three table/state systems: shared DataTable/feedback, console table/StatePanel, admin AdminTable.
- Console and shared packages both implement context switchers and permission choices.
- API-key detail has a non-functional visual tab strip alongside canonical Tabs.

D1 only normalized behavior inside canonical foundations. Route migrations belong to the route-owning D-phase because they can change product layout and behavior.
