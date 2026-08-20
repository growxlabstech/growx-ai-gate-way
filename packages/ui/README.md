# @growx/ui

The coded Figma-equivalent design library for GrowX AI Gateway. Product applications compose this package; they do not invent visible identity locally.

## Foundations

Dedicated modules under `src/tokens/` define color, typography, spacing, radius, borders, shadows, motion, layout, breakpoints, and z-index. `tokens.css` exposes the same contract to CSS. Global focus, selection, scrollbar, responsive, zoom-safe, and reduced-motion behavior ships in `components.css`.

## Component families

- Primitives: Text, Divider, Surface, Stack, Inline, Container, Grid, VisuallyHidden
- Icons: the GrowX `gx-*` geometric baseline icon family
- Controls: Button, IconButton, ButtonGroup, Field, Input, Textarea, SearchInput, PasswordInput, NumberInput, Select, Combobox, Checkbox, Radio, Switch, Slider, SegmentedControl
- Status: Badge, Chip, Pill, StatusDot, HealthIndicator, Progress, Meter
- Navigation: AppShell, Topbar, Sidebar, SidebarGroup, SidebarItem, Breadcrumb, Tabs, Pagination, CommandPalette, context switchers
- Surfaces: Card, InteractiveCard, MetricCard, Panel, Callout, Banner, Inspector, PageHeader, Toolbar
- Data: Table, DataTable, TableToolbar, TablePagination, RowActions, KeyValue, Timeline, LogRow
- Overlays: Tooltip, Dropdown, Popover, Flyout, Sheet, Modal, AlertDialog, Toast
- Feedback: Skeleton, Spinner, LoadingState, EmptyState, ErrorState, PermissionState, OfflineState, RetryState
- Developer: CodeBlock, InlineCode, JsonViewer, CopyButton, RequestInspector, ResponseViewer, ApiKeySecretDialog, ModelSelector, PlaygroundInput, StreamingOutput
- Charts: ChartContainer, ChartLegend, ChartTooltip, Line, Area, Bar, Stacked Bar, Donut, Sparkline, Heatmap
- Domain: API keys, models, providers, routing, requests, usage, billing, webhooks, audit, security, and privileged-operation assemblies
- Templates: resource list/detail, dashboard, settings, logs, playground, billing, analytics, and privileged operations

## Contract

Every visible component uses GrowX tokens and defines its applicable variant, size, default, hover, focus, active, disabled, loading, and error states. Accessible semantics and labels are required. Operational meaning is never encoded by color alone. Shadows are reserved for overlays.

Canonical coded examples and usage guidance live at `/design/*`; `/design/all` is the complete integration reference.
