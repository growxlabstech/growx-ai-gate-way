import { notFound, redirect } from "next/navigation";
import { ConsoleShell } from "./console-shell";
import { loadTenantContext } from "../lib/load-tenant-context";
import { workspacesForOrganization } from "../lib/tenant-context";

type ShellProps = {
  organizationSlug: string;
  workspaceSlug?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
};

export async function AppShell({
  organizationSlug,
  workspaceSlug,
  title,
  description,
  action,
  children,
}: ShellProps) {
  const result = await loadTenantContext();
  if (result.status === "unauthenticated")
    redirect(
      `/sign-in?returnTo=/${organizationSlug}${workspaceSlug ? `/${workspaceSlug}` : ""}`,
    );
  if (result.status === "empty") redirect("/onboarding");
  if (result.status === "error")
    return (
      <main className="shell-failure">
        <section className="state" role="alert">
          <div>
            <h1>Workspace context unavailable</h1>
            <p>
              GrowX could not safely load your organization and workspace
              access. Previous tenant data has not been shown.
            </p>
            <a className="retry-link" href="">
              Retry
            </a>
          </div>
        </section>
      </main>
    );

  const activeOrganization = result.context.organizations.find(
    (organization) =>
      organization.organizationSlug === organizationSlug &&
      organization.status === "active",
  );
  if (!activeOrganization) notFound();
  const availableWorkspaces = workspacesForOrganization(
    result.context,
    activeOrganization.organizationId,
  );
  const activeWorkspace = workspaceSlug
    ? availableWorkspaces.find(
        (workspace) => workspace.workspaceSlug === workspaceSlug,
      )
    : undefined;
  if (workspaceSlug && !activeWorkspace) notFound();

  return (
    <ConsoleShell
      context={result.context}
      activeOrganization={activeOrganization}
      activeWorkspace={activeWorkspace}
      title={title}
      description={description}
      action={action}
    >
      {children}
    </ConsoleShell>
  );
}

export function StatePanel({
  title,
  detail,
  action,
}: {
  title: string;
  detail: string;
  action?: React.ReactNode;
}) {
  return (
    <section className="state" role="status">
      <span className="state-icon" aria-hidden="true">
        ◇
      </span>
      <div>
        <h2>{title}</h2>
        <p>{detail}</p>
        {action}
      </div>
    </section>
  );
}
export function EnvironmentBadge({
  type,
}: {
  type: "development" | "staging" | "production";
}) {
  return <span className={`badge ${type}`}>{type}</span>;
}
export function PermissionEditor() {
  return (
    <fieldset>
      <legend>Permissions</legend>
      {[
        "models.read",
        "responses.create",
        "chat.completions.create",
        "embeddings.create",
        "usage.read",
      ].map((scope) => (
        <label className="check" key={scope}>
          <input
            type="checkbox"
            name="permissions"
            value={scope}
            defaultChecked={["models.read", "responses.create"].includes(scope)}
          />
          {scope}
        </label>
      ))}
    </fieldset>
  );
}
export function ModelAccessEditor() {
  return (
    <fieldset>
      <legend>Model access</legend>
      <label>
        Policy
        <select name="modelPolicy" defaultValue="all">
          <option value="all">All workspace models</option>
          <option value="selected">Selected models only</option>
        </select>
      </label>
      <label>
        Patterns
        <input name="models" placeholder="growx/fast, openai/*" />
      </label>
    </fieldset>
  );
}
export function RateLimitEditor() {
  return (
    <fieldset>
      <legend>Rate limits</legend>
      <div className="form-grid">
        <label>
          Requests / minute
          <input type="number" name="rpm" min="1" defaultValue="60" />
        </label>
        <label>
          Concurrent requests
          <input type="number" name="concurrency" min="1" defaultValue="5" />
        </label>
      </div>
    </fieldset>
  );
}
export function SpendingLimitEditor() {
  return (
    <fieldset>
      <legend>Spending</legend>
      <div className="form-grid">
        <label>
          Mode
          <select name="budgetMode" defaultValue="hard">
            <option value="warn">Warn only</option>
            <option value="soft">Soft limit</option>
            <option value="hard">Hard stop</option>
          </select>
        </label>
        <label>
          Monthly limit (USD)
          <input type="number" name="budget" min="0" placeholder="500" />
        </label>
      </div>
    </fieldset>
  );
}
export function IpAllowListEditor() {
  return (
    <fieldset>
      <legend>IP restrictions</legend>
      <label>
        IPv4, IPv6, or CIDR entries
        <textarea
          name="ipAllowlist"
          rows={4}
          placeholder={"203.0.113.42\n203.0.113.0/24"}
        />
      </label>
      <p className="muted">Leave empty to allow any IP.</p>
    </fieldset>
  );
}
