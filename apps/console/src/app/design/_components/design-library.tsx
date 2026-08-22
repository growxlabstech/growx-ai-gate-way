"use client";
import type { ReactNode } from "react";
import {
  AlertDialog,
  ApiKeyLimitsEditor,
  ApiKeyPermissionsEditor,
  ApiKeyRow,
  ApiKeySecretDialog,
  ApprovalCard,
  AreaChart,
  AuditEventRow,
  Badge,
  Banner,
  BarChart,
  BillingStatus,
  BillingTemplate,
  BreakGlassBanner,
  Breadcrumb,
  Button,
  ButtonGroup,
  Callout,
  CapabilityBadge,
  Card,
  ChartContainer,
  ChartLegend,
  Checkbox,
  Chip,
  CodeBlock,
  Combobox,
  CommandPalette,
  CreditBalance,
  CreditHistory,
  DataTable,
  DonutChart,
  Dropdown,
  EmptyState,
  EnvironmentSwitcher,
  ErrorState,
  Field,
  FilterButton,
  Flyout,
  GxIcon,
  HealthIndicator,
  Heatmap,
  IconButton,
  InlineCode,
  Input,
  InteractiveCard,
  InvoiceRow,
  JsonViewer,
  LineChart,
  LoadingState,
  LogsTemplate,
  Meter,
  MetricCard,
  ModelBadge,
  ModelRow,
  ModelSelector,
  Modal,
  NumberInput,
  OfflineState,
  OrganizationSwitcher,
  Pagination,
  Panel,
  PasswordInput,
  PermissionState,
  Pill,
  PlaygroundInput,
  PlaygroundTemplate,
  Popover,
  PrivilegedOperationsTemplate,
  PrivilegedSessionIndicator,
  Progress,
  ProviderCapacity,
  ProviderCircuitState,
  ProviderHealthBadge,
  ProviderRow,
  Radio,
  RequestInspector,
  RequestTable,
  RequestTiming,
  ResourceDetailTemplate,
  ResourceListTemplate,
  ResponseViewer,
  RetryState,
  RoutingPolicyCard,
  SearchInput,
  SegmentedControl,
  Segment,
  Select,
  Sheet,
  Sidebar,
  SidebarGroup,
  SidebarItem,
  Skeleton,
  Slider,
  Sparkline,
  Spinner,
  StackedBar,
  StatusDot,
  StreamingOutput,
  Switch,
  Tab,
  Table,
  Tabs,
  Textarea,
  Toast,
  Tooltip,
  Topbar,
  TrafficAllocation,
  UsageBreakdown,
  UsageMetric,
  WebhookDeliveryInspector,
  WebhookDeliveryRow,
  WebhookRow,
  WorkspaceSwitcher,
  gxIconNames,
  PageHeader,
  Toolbar,
  DashboardTemplate,
  SettingsTemplate,
  AnalyticsTemplate,
  TemplateHeader,
} from "@growx/ui";
import styles from "./library.module.css";

export type LibrarySection =
  | "buttons"
  | "forms"
  | "status"
  | "cards"
  | "tables"
  | "navigation"
  | "overlays"
  | "developer"
  | "charts"
  | "icons"
  | "motion"
  | "feedback"
  | "domain"
  | "templates";
const sections: LibrarySection[] = [
  "icons",
  "buttons",
  "forms",
  "status",
  "navigation",
  "cards",
  "tables",
  "overlays",
  "developer",
  "charts",
  "feedback",
  "domain",
  "motion",
  "templates",
];
const meta: Record<LibrarySection, [string, string]> = {
  icons: [
    "GrowX custom icons",
    "Geometric, technical 1.65-stroke identity across 16–24px grids.",
  ],
  buttons: [
    "Controls / Buttons",
    "Neutral-first actions with complete size, state, focus, loading, and danger contracts.",
  ],
  forms: [
    "Controls / Forms",
    "Accessible fields and dense infrastructure inputs built on a 38px default control.",
  ],
  status: [
    "Status language",
    "Semantic badges, chips, indicators, progress, and meters without color-only meaning.",
  ],
  navigation: [
    "Navigation",
    "Tenant context, grouped hierarchy, tabs, breadcrumbs, pagination, and command discovery.",
  ],
  cards: [
    "Surfaces",
    "Cards only where containment is useful; panels, metrics, banners, and callouts remain quiet.",
  ],
  tables: [
    "Tables & data",
    "Dense 38px headers, 48px rows, technical identifiers, selection, and row actions.",
  ],
  overlays: [
    "Overlays",
    "Tooltips through technical flyouts, with deliberate widths and overlay-only shadows.",
  ],
  developer: [
    "Developer surfaces",
    "Code, request inspection, response output, keys, models, and streaming surfaces.",
  ],
  charts: [
    "Charts",
    "Operational data using Ice as primary series and restrained semantic secondary colors.",
  ],
  feedback: [
    "Feedback states",
    "Compact loading, empty, error, permission, offline, and retry states.",
  ],
  domain: [
    "Domain components",
    "Gateway-specific reusable assemblies built before feature screens.",
  ],
  motion: [
    "Motion",
    "Quiet timing with no bounce or decorative movement; reduced motion is mandatory.",
  ],
  templates: [
    "Page templates",
    "Complete assembly patterns for every GrowX product surface.",
  ],
};
function Docs() {
  return (
    <div className={styles.doc}>
      <div>
        <strong>Purpose</strong>
        <span>Reusable GrowX product contract</span>
      </div>
      <div>
        <strong>Variants</strong>
        <span>Semantic, size, density, and state variants</span>
      </div>
      <div>
        <strong>Sizes</strong>
        <span>Documented component-specific scale</span>
      </div>
      <div>
        <strong>States</strong>
        <span>
          Default · hover · focus · active · disabled · loading · error
        </span>
      </div>
      <div>
        <strong>Do</strong>
        <span>Use approved intent and real gateway context</span>
      </div>
      <div>
        <strong>Don’t</strong>
        <span>Invent color, radius, shadow, or behavior</span>
      </div>
      <div>
        <strong>Accessibility</strong>
        <span>Keyboard · labels · contrast · reduced motion · 200% zoom</span>
      </div>
      <div>
        <strong>GrowX example</strong>
        <span>The coded specimen below is the canonical example</span>
      </div>
    </div>
  );
}
function Section({
  id,
  index,
  children,
}: {
  id: LibrarySection;
  index: number;
  children: ReactNode;
}) {
  return (
    <section className={styles.section} id={id}>
      <header className={styles.sectionHeader}>
        <div>
          <span>{String(index + 1).padStart(2, "0")}</span>
          <h2>{meta[id][0]}</h2>
        </div>
        <p>{meta[id][1]}</p>
      </header>
      <Docs />
      <div className={styles.canvas}>{children}</div>
    </section>
  );
}
const rows = [
  {
    name: "Production",
    environment: "Production",
    members: 8,
    usage: "1.2M",
    status: "Active",
  },
  {
    name: "Staging",
    environment: "Staging",
    members: 4,
    usage: "82K",
    status: "Active",
  },
];
function Content({ id }: { id: LibrarySection }) {
  if (id === "icons")
    return (
      <div className={styles.iconGrid}>
        {gxIconNames.map((name) => (
          <div key={name}>
            <GxIcon name={name} />
            <span>gx-{name}</span>
          </div>
        ))}
      </div>
    );
  if (id === "buttons")
    return (
      <div className={styles.stack}>
        <div className={styles.row}>
          {(["primary", "secondary", "ghost", "danger", "link"] as const).map(
            (v) => (
              <Button variant={v} key={v}>
                {v}
              </Button>
            ),
          )}
          <IconButton icon="more" label="More actions" />
        </div>
        <div className={styles.row}>
          {(["xs", "sm", "md", "lg"] as const).map((v) => (
            <Button variant="secondary" size={v} key={v}>
              {v.toUpperCase()} button
            </Button>
          ))}
        </div>
        <div className={styles.row}>
          <Button disabled>Disabled</Button>
          <Button loading>Loading</Button>
          <ButtonGroup>
            <Button>Cancel</Button>
            <Button variant="primary">Deploy</Button>
          </ButtonGroup>
        </div>
      </div>
    );
  if (id === "forms")
    return (
      <div className={styles.grid3}>
        <div className={styles.stack}>
          <Field
            label="API key name"
            description="Identify the consuming system."
          >
            <Input placeholder="Production gateway" />
          </Field>
          <Field label="Secret" error="Must contain at least 12 characters.">
            <PasswordInput error defaultValue="short" />
          </Field>
          <SearchInput placeholder="Search requests…" />
        </div>
        <div className={styles.stack}>
          <Field label="Model">
            <Select defaultValue="growx/smart">
              <option>growx/smart</option>
              <option>growx/fast</option>
            </Select>
          </Field>
          <Field label="Maximum output">
            <NumberInput defaultValue={1024} />
          </Field>
          <Textarea rows={4} placeholder="System instructions" />
        </div>
        <div className={styles.stack}>
          <Checkbox label="Streaming" defaultChecked />
          <Radio label="Balanced routing" defaultChecked />
          <Switch label="Structured output" />
          <Slider defaultValue={68} />
          <SegmentedControl>
            <Segment active>Live</Segment>
            <Segment>Test</Segment>
          </SegmentedControl>
          <Combobox defaultValue="Production">
            <option>Production</option>
          </Combobox>
        </div>
      </div>
    );
  if (id === "status")
    return (
      <div className={styles.stack}>
        <div className={styles.row}>
          {(
            [
              "neutral",
              "ice",
              "health",
              "warning",
              "critical",
              "information",
            ] as const
          ).map((t) => (
            <Badge tone={t} key={t}>
              {t}
            </Badge>
          ))}
          <Chip tone="ice">Capability</Chip>
          <Pill>Production</Pill>
        </div>
        <div className={styles.row}>
          <StatusDot tone="health" label="Operational" />
          <HealthIndicator>Operational</HealthIndicator>
          <HealthIndicator tone="warning">Degraded</HealthIndicator>
        </div>
        <Progress value={68} />
        <Meter value={42} />
      </div>
    );
  if (id === "navigation")
    return (
      <div className={styles.stack}>
        <Topbar context="GrowX Labs / Production" />
        <div className={styles.grid3}>
          <Sidebar>
            <SidebarGroup label="Build">
              <SidebarItem href="#" icon="playground" label="Playground" />
              <SidebarItem href="#" icon="model" label="Models" active />
              <SidebarItem href="#" icon="key" label="API keys" />
            </SidebarGroup>
            <SidebarGroup label="Observe">
              <SidebarItem href="#" icon="log" label="Logs" />
              <SidebarItem href="#" icon="usage" label="Usage" />
            </SidebarGroup>
          </Sidebar>
          <div className={styles.stack}>
            <Breadcrumb
              items={[
                { label: "GrowX Labs", href: "#" },
                { label: "Production", href: "#" },
                { label: "Models" },
              ]}
            />
            <Tabs>
              <Tab active>Overview</Tab>
              <Tab>Capabilities</Tab>
              <Tab>Pricing</Tab>
            </Tabs>
            <Pagination page={2} pages={8} />
            <OrganizationSwitcher value="GrowX Labs" options={["GrowX Labs"]} />
            <WorkspaceSwitcher
              value="Production"
              options={["Production", "Staging"]}
            />
            <EnvironmentSwitcher
              value="Production"
              options={["Production", "Development"]}
            />
          </div>
          <CommandPalette />
        </div>
      </div>
    );
  if (id === "cards")
    return (
      <div className={styles.stack}>
        <div className={styles.grid4}>
          <Card>
            <strong>Standard card</strong>
            <p>Deliberate containment.</p>
          </Card>
          <InteractiveCard>
            <strong>Interactive card</strong>
            <p>Focus and hover states.</p>
          </InteractiveCard>
          <MetricCard label="Requests" value="1.28M" context="+12.4%" />
          <MetricCard
            label="P95 latency"
            value="342ms"
            context="Within SLO"
            tone="health"
          />
        </div>
        <div className={styles.grid2}>
          <Panel>
            <strong>Operational panel</strong>
            <p>Structured content without unnecessary elevation.</p>
          </Panel>
          <div className={styles.stack}>
            <Callout title="Routing fallback active" tone="warning">
              Traffic remains available.
            </Callout>
            <Banner tone="health">All providers operational</Banner>
          </div>
        </div>
      </div>
    );
  if (id === "tables")
    return (
      <div className={styles.stack}>
        <Toolbar>
          <SearchInput placeholder="Search workspaces" />
          <FilterButton />
        </Toolbar>
        <DataTable
          rows={rows}
          getRowKey={(r) => r.name}
          columns={[
            { key: "name", header: "Workspace" },
            { key: "environment", header: "Environment" },
            { key: "members", header: "Members" },
            { key: "usage", header: "Usage", technical: true },
            {
              key: "status",
              header: "Status",
              render: (r) => <Badge tone="health">{r.status}</Badge>,
            },
          ]}
        />
        <Pagination page={1} pages={4} />
      </div>
    );
  if (id === "overlays")
    return (
      <div className={styles.stack}>
        <div className={styles.row}>
          <Tooltip content="Copy request ID">
            <IconButton icon="copy" label="Copy" />
          </Tooltip>
          <Dropdown label={<Button>Actions</Button>}>
            <Button variant="ghost">Rotate key</Button>
          </Dropdown>
          <Popover title="Provider health">
            <p>All regions operational.</p>
          </Popover>
        </div>
        <div className={styles.overlayStage}>
          <Modal
            open
            title="Create API key"
            description="The secret is shown once."
            footer={
              <>
                <Button>Cancel</Button>
                <Button variant="primary">Create key</Button>
              </>
            }
          >
            <Field label="Name">
              <Input defaultValue="Production gateway" />
            </Field>
          </Modal>
        </div>
        <div className={styles.row}>
          <Badge>Flyout 480</Badge>
          <Badge>Technical 640</Badge>
          <Badge>Large 720</Badge>
          <Badge>Modal 400 / 520 / 680</Badge>
          <Toast title="Routing policy saved">Version 18 is now active.</Toast>
        </div>
      </div>
    );
  if (id === "developer")
    return (
      <div className={styles.stack}>
        <div className={styles.grid2}>
          <CodeBlock
            language="TypeScript"
            code={
              'const response = await growx.responses.create({\n  model: "growx/smart",\n  input: "Summarize provider health",\n});'
            }
          />
          <JsonViewer
            value={{
              id: "req_01J9GROWX",
              status: "completed",
              usage: { input: 824, output: 213 },
            }}
          />
        </div>
        <RequestInspector />
        <div className={styles.grid2}>
          <ApiKeySecretDialog />
          <ResponseViewer>
            <InlineCode>Streaming completed successfully.</InlineCode>
          </ResponseViewer>
        </div>
        <ModelSelector />
        <div className={styles.grid2}>
          <PlaygroundInput />
          <StreamingOutput />
        </div>
      </div>
    );
  if (id === "charts")
    return (
      <div className={styles.grid3}>
        <ChartContainer
          title="Requests"
          legend={<ChartLegend items={[{ label: "Requests", tone: "ice" }]} />}
        >
          <LineChart values={[24, 36, 30, 58, 54, 76, 69, 88]} />
        </ChartContainer>
        <ChartContainer title="Provider latency">
          <AreaChart values={[62, 55, 69, 44, 38, 52, 31]} />
        </ChartContainer>
        <ChartContainer title="Traffic split">
          <DonutChart value={72} label="Primary" />
        </ChartContainer>
        <ChartContainer title="Daily volume">
          <BarChart values={[34, 52, 42, 76, 68, 91, 84, 63]} />
        </ChartContainer>
        <ChartContainer title="Allocation">
          <StackedBar
            segments={[
              { value: 70, tone: "ice" },
              { value: 20, tone: "health" },
              { value: 10, tone: "warning" },
            ]}
          />
        </ChartContainer>
        <ChartContainer title="Regional health">
          <Heatmap
            values={Array.from({ length: 48 }, (_, i) => (i * 19) % 100)}
          />
        </ChartContainer>
      </div>
    );
  if (id === "feedback")
    return (
      <div className={styles.stack}>
        <div className={styles.row}>
          <Spinner />
          <Skeleton width={180} />
          <Skeleton width={90} />
        </div>
        <div className={styles.stateGrid}>
          <EmptyState
            title="No workspaces yet"
            description="Create your first workspace to organize environments, API keys, usage and routing."
            action={<Button variant="primary">Create workspace</Button>}
          />
          <ErrorState
            title="Requests unavailable"
            description="Gateway activity could not be loaded."
          />
          <PermissionState
            title="Permission required"
            description="You do not have access to billing settings."
          />
          <OfflineState
            title="Provider unavailable"
            description="Health checks are temporarily unreachable."
          />
          <RetryState
            title="Try again"
            description="The request timed out safely."
          />
          <LoadingState title="Loading gateway activity" />
        </div>
      </div>
    );
  if (id === "domain")
    return (
      <div className={styles.domainGrid}>
        <div className={styles.stack}>
          <ApiKeyRow />
          <ApiKeyPermissionsEditor />
          <ApiKeyLimitsEditor />
          <ModelRow />
          <ProviderRow />
          <RoutingPolicyCard />
          <TrafficAllocation />
        </div>
        <div className={styles.stack}>
          <RequestTable />
          <RequestTiming />
          <UsageBreakdown />
          <CreditBalance />
          <CreditHistory />
          <UsageMetric />
          <BillingStatus />
          <InvoiceRow />
          <WebhookRow />
          <WebhookDeliveryRow />
          <WebhookDeliveryInspector />
          <AuditEventRow />
          <PrivilegedSessionIndicator />
          <ApprovalCard />
          <BreakGlassBanner />
        </div>
      </div>
    );
  if (id === "motion")
    return (
      <div className={styles.motionGrid}>
        {[
          ["Fast", "120ms"],
          ["Standard", "180ms"],
          ["Overlay", "220ms"],
          ["Large", "280ms"],
        ].map(([n, s]) => (
          <div key={n} style={{ "--speed": s } as React.CSSProperties}>
            <strong>{n}</strong>
            <span>{s}</span>
            <i />
          </div>
        ))}
      </div>
    );
  return <Templates />;
}
function Templates() {
  const header = (
    <TemplateHeader
      title="Workspaces"
      description="Manage environments, access and usage boundaries."
      actions={<Button variant="primary">Create workspace</Button>}
    />
  );
  const table = (
    <DataTable
      rows={rows}
      getRowKey={(r) => r.name}
      columns={[
        { key: "name", header: "Workspace" },
        { key: "environment", header: "Environment" },
        { key: "usage", header: "Usage" },
        { key: "status", header: "Status" },
      ]}
    />
  );
  return (
    <div className={styles.templateStack}>
      <div className={styles.templateBlock}>
        <h3>Resource list</h3>
        <ResourceListTemplate
          header={header}
          toolbar={
            <>
              <SearchInput placeholder="Search workspaces" />
              <FilterButton />
            </>
          }
          pagination={<Pagination page={1} pages={4} />}
        >
          {table}
        </ResourceListTemplate>
      </div>
      <div className={styles.templateBlock}>
        <h3>Resource detail</h3>
        <ResourceDetailTemplate
          breadcrumb={
            <Breadcrumb
              items={[{ label: "Models" }, { label: "growx/smart" }]}
            />
          }
          header={
            <PageHeader
              title="growx/smart"
              description="Balanced intelligence for production workloads."
            />
          }
          metadata={
            <div className={styles.row}>
              <ModelBadge />
              <CapabilityBadge>Streaming</CapabilityBadge>
              <Badge tone="health">Available</Badge>
            </div>
          }
          tabs={
            <Tabs>
              <Tab active>Overview</Tab>
              <Tab>Capabilities</Tab>
            </Tabs>
          }
        >
          <Panel>Model detail content</Panel>
        </ResourceDetailTemplate>
      </div>
      <div className={styles.templateBlock}>
        <h3>Dashboard</h3>
        <DashboardTemplate
          header={<PageHeader title="Gateway overview" />}
          metrics={
            <>
              <MetricCard label="Requests" value="1.28M" />
              <MetricCard label="P95" value="342ms" />
              <MetricCard label="Errors" value="0.12%" />
              <MetricCard label="Spend" value="$1,284" />
            </>
          }
          panels={
            <>
              <ChartContainer title="Requests">
                <Sparkline values={[20, 44, 38, 72, 60, 90]} />
              </ChartContainer>
              <Panel>Provider health</Panel>
            </>
          }
          activity={table}
        />
      </div>
      <div className={styles.templateBlock}>
        <h3>Settings</h3>
        <SettingsTemplate
          navigation={
            <Sidebar>
              <SidebarGroup label="Settings">
                <SidebarItem label="General" active />
                <SidebarItem label="Security" />
              </SidebarGroup>
            </Sidebar>
          }
          header={<PageHeader title="Workspace settings" />}
        >
          <Field label="Workspace name">
            <Input defaultValue="Production" />
          </Field>
        </SettingsTemplate>
      </div>
      <div className={styles.templateBlock}>
        <h3>Logs</h3>
        <LogsTemplate
          header={<PageHeader title="Gateway logs" />}
          filters={
            <>
              <SearchInput placeholder="Request ID" />
              <FilterButton />
            </>
          }
          table={<RequestTable />}
        />
      </div>
      <div className={styles.templateBlock}>
        <h3>Playground</h3>
        <PlaygroundTemplate
          header={<PageHeader title="Playground" />}
          model={<ModelSelector />}
          input={<PlaygroundInput />}
          output={<StreamingOutput />}
          metadata={<InlineCode>Request ID · Latency · Usage</InlineCode>}
        />
      </div>
      <div className={styles.templateBlock}>
        <h3>Billing</h3>
        <BillingTemplate
          header={<PageHeader title="Billing" />}
          balance={<CreditBalance />}
          usage={<UsageMetric label="Current spend" value="$1,284.92" />}
          invoices={<InvoiceRow />}
          settings={<Panel>Payment settings</Panel>}
        />
      </div>
      <div className={styles.templateBlock}>
        <h3>Analytics</h3>
        <AnalyticsTemplate
          header={<PageHeader title="Routing analytics" />}
          metrics={<UsageMetric />}
          chart={
            <ChartContainer title="Latency">
              <LineChart values={[20, 30, 28, 50, 42]} />
            </ChartContainer>
          }
          table={<RequestTable />}
        />
      </div>
      <div className={styles.templateBlock}>
        <h3>Privileged operations</h3>
        <PrivilegedOperationsTemplate
          context={<PrivilegedSessionIndicator />}
          header={<PageHeader title="Provider capacity" />}
          controls={
            <>
              <Button>Drain</Button>
              <Button variant="danger">Open circuit</Button>
            </>
          }
          data={<ProviderRow />}
        />
      </div>
    </div>
  );
}
export function DesignLibrary({ only }: { only?: LibrarySection[] }) {
  const active = only ?? sections;
  return (
    <main className={`gx-design-library ${styles.page}`}>
      <header className={styles.masthead}>
        <div>
          <div className={styles.brand}>
            <span>G</span>
            <strong>GrowX AI</strong>
          </div>
          <p>Coded Figma-equivalent library</p>
          <h1>One intentional system for every gateway surface.</h1>
        </div>
        <aside>
          <Badge tone="ice">Design foundation</Badge>
          <span>{active.length} library sections</span>
        </aside>
      </header>
      <nav className={styles.nav} aria-label="Design library sections">
        {active.map((id) => (
          <a href={`#${id}`} key={id}>
            {meta[id][0]}
          </a>
        ))}
      </nav>
      {active.map((id, index) => (
        <Section id={id} index={index} key={id}>
          <Content id={id} />
        </Section>
      ))}
      <footer className={styles.allStatus}>
        <span>Obsidian × Frost × GrowX Ice</span>
        <strong>Reusable library foundation</strong>
      </footer>
    </main>
  );
}
