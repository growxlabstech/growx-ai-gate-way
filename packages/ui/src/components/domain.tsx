import type { ReactNode } from "react";
import { Button, Checkbox, Field, NumberInput, Select } from "./controls";
import { Badge, HealthIndicator, Meter, Progress } from "./status";
import { Card, Callout, MetricCard } from "./surfaces";
import { RowActions, Table } from "./data";
import { InlineCode, RequestInspector } from "./developer";
import {
  OrganizationSwitcher,
  WorkspaceSwitcher,
  EnvironmentSwitcher,
} from "./navigation";
export { OrganizationSwitcher, WorkspaceSwitcher, EnvironmentSwitcher };
export function ApiKeyRow({
  name = "Production gateway",
  prefix = "gx_live_key_01…",
  environment = "Production",
  status = "Active",
}: {
  name?: string;
  prefix?: string;
  environment?: string;
  status?: string;
}) {
  return (
    <div className="gx-domain-row">
      <div>
        <strong>{name}</strong>
        <InlineCode>{prefix}</InlineCode>
      </div>
      <Badge>{environment}</Badge>
      <Badge tone="health">{status}</Badge>
      <RowActions />
    </div>
  );
}
export function ApiKeyPermissionsEditor() {
  return (
    <Field
      label="Permissions"
      description="Grant only the scopes this system requires."
    >
      {["models.read", "responses.create", "usage.read"].map((scope, index) => (
        <Checkbox key={scope} label={scope} defaultChecked={index < 2} />
      ))}
    </Field>
  );
}
export function ApiKeyLimitsEditor() {
  return (
    <div className="gx-form-grid">
      <Field label="Requests per minute">
        <NumberInput defaultValue={60} />
      </Field>
      <Field label="Concurrent requests">
        <NumberInput defaultValue={5} />
      </Field>
    </div>
  );
}
export function ModelBadge({
  children = "growx/smart",
}: {
  children?: ReactNode;
}) {
  return <Badge tone="ice">{children}</Badge>;
}
export function CapabilityBadge({ children }: { children: ReactNode }) {
  return <Badge>{children}</Badge>;
}
export function ModelRow({
  name = "growx/smart",
  provider = "GrowX managed",
  context = "128K",
  status = "Available",
}: {
  name?: string;
  provider?: string;
  context?: string;
  status?: string;
}) {
  return (
    <div className="gx-domain-row">
      <ModelBadge>{name}</ModelBadge>
      <span>{provider}</span>
      <InlineCode>{context}</InlineCode>
      <HealthIndicator>{status}</HealthIndicator>
      <RowActions />
    </div>
  );
}
export function ProviderHealthBadge({
  status = "Operational",
}: {
  status?: "Operational" | "Degraded" | "Offline";
}) {
  return (
    <Badge
      tone={
        status === "Operational"
          ? "health"
          : status === "Degraded"
            ? "warning"
            : "critical"
      }
    >
      {status}
    </Badge>
  );
}
export function ProviderCapacity({ value = 68 }: { value?: number }) {
  return (
    <div className="gx-domain-meter">
      <span>Capacity</span>
      <Meter value={value} />
      <strong>{value}%</strong>
    </div>
  );
}
export function ProviderCircuitState({ open = false }: { open?: boolean }) {
  return (
    <Badge tone={open ? "critical" : "health"}>
      Circuit {open ? "open" : "closed"}
    </Badge>
  );
}
export function ProviderRow({
  name = "Primary inference",
  region = "US East",
}: {
  name?: string;
  region?: string;
}) {
  return (
    <div className="gx-domain-row">
      <div>
        <strong>{name}</strong>
        <span>{region}</span>
      </div>
      <ProviderHealthBadge />
      <ProviderCapacity />
      <ProviderCircuitState />
      <RowActions />
    </div>
  );
}
export function RoutingPolicyCard() {
  return (
    <Card>
      <header className="gx-domain-heading">
        <div>
          <Badge tone="ice">Active policy</Badge>
          <h3>Latency balanced</h3>
        </div>
        <RowActions />
      </header>
      <p>
        Balances model capability, provider health, capacity, and request
        latency.
      </p>
      <FallbackChain />
    </Card>
  );
}
export function TrafficAllocation() {
  return (
    <div className="gx-traffic">
      <span>Primary 70%</span>
      <Progress value={70} />
      <span>Fallback 30%</span>
    </div>
  );
}
export function FallbackChain() {
  return (
    <div className="gx-fallback-chain">
      <Badge>growx/smart</Badge>
      <span>→</span>
      <Badge>growx/fast</Badge>
      <span>→</span>
      <Badge>safe fallback</Badge>
    </div>
  );
}
export function RequestTable() {
  return (
    <Table>
      <thead>
        <tr>
          <th>Request ID</th>
          <th>Model</th>
          <th>Status</th>
          <th>Latency</th>
          <th>Tokens</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>
            <InlineCode>req_01J9GROWX</InlineCode>
          </td>
          <td>growx/smart</td>
          <td>
            <Badge tone="health">Completed</Badge>
          </td>
          <td>342ms</td>
          <td>1,037</td>
        </tr>
      </tbody>
    </Table>
  );
}
export { RequestInspector };
export function RequestTiming() {
  return (
    <div className="gx-timing">
      {[
        ["Gateway", "18ms"],
        ["Queue", "24ms"],
        ["Provider", "286ms"],
        ["Stream", "14ms"],
      ].map(([label, value]) => (
        <span key={label}>
          <i />
          {label}
          <strong>{value}</strong>
        </span>
      ))}
    </div>
  );
}
export function UsageBreakdown() {
  return (
    <div className="gx-metric-grid">
      <MetricCard label="Input" value="824" context="tokens" />
      <MetricCard label="Output" value="213" context="tokens" />
      <MetricCard label="Charge" value="$0.0042" />
    </div>
  );
}
export function CreditBalance({ value = "$1,284.92" }: { value?: string }) {
  return (
    <MetricCard
      label="Credit balance"
      value={value}
      context="Updated after settlement"
    />
  );
}
export function CreditHistory() {
  return (
    <div className="gx-domain-row">
      <span>Promotional grant</span>
      <strong>+$500.00</strong>
      <span>Aug 12, 2026</span>
    </div>
  );
}
export function UsageMetric({
  label = "Requests",
  value = "1.28M",
}: {
  label?: string;
  value?: string;
}) {
  return <MetricCard label={label} value={value} />;
}
export function BillingStatus() {
  return <Badge tone="health">Account in good standing</Badge>;
}
export function InvoiceRow() {
  return (
    <div className="gx-domain-row">
      <InlineCode>INV-2026-0082</InlineCode>
      <span>August 2026</span>
      <strong>$1,284.92</strong>
      <Badge tone="health">Paid</Badge>
      <RowActions />
    </div>
  );
}
export function WebhookRow() {
  return (
    <div className="gx-domain-row">
      <div>
        <strong>Production events</strong>
        <InlineCode>https://api.example.com/growx</InlineCode>
      </div>
      <Badge tone="health">Active</Badge>
      <RowActions />
    </div>
  );
}
export function WebhookDeliveryRow() {
  return (
    <div className="gx-domain-row">
      <InlineCode>evt_01J9GROWX</InlineCode>
      <span>response.completed</span>
      <Badge tone="health">200</Badge>
      <InlineCode>184ms</InlineCode>
      <RowActions />
    </div>
  );
}
export function WebhookDeliveryInspector() {
  return (
    <Callout title="Delivery verified" tone="health" icon="check">
      Signature accepted. Response body is not retained.
    </Callout>
  );
}
export function AuditEventRow() {
  return (
    <div className="gx-domain-row">
      <Badge>API key</Badge>
      <div>
        <strong>Key rotated</strong>
        <span>by alex@growx.ai</span>
      </div>
      <InlineCode>aud_01J9GROWX</InlineCode>
      <span>4 min ago</span>
    </div>
  );
}
export function SecurityEventRow() {
  return (
    <div className="gx-domain-row">
      <Badge tone="warning">Medium</Badge>
      <div>
        <strong>Repeated authentication failure</strong>
        <span>Tenant-scoped metadata only</span>
      </div>
      <span>11 min ago</span>
      <RowActions />
    </div>
  );
}
export function PrivilegedSessionIndicator() {
  return (
    <Badge tone="warning">
      Privileged session · expires in 11 min · INC-482
    </Badge>
  );
}
export function ApprovalCard() {
  return (
    <Card>
      <Badge tone="warning">Approval required</Badge>
      <h3>Override provider circuit</h3>
      <p>
        Requires a second operator and creates immutable audit and security
        events.
      </p>
      <Button>Request approval</Button>
    </Card>
  );
}
export function BreakGlassBanner() {
  return (
    <Callout tone="critical" title="Break-glass access active" icon="critical">
      Emergency scope is time-bound, reason-bound, and fully audited.
    </Callout>
  );
}
