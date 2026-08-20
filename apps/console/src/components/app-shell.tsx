import Link from "next/link";

type ShellProps = { organizationSlug: string; workspaceSlug?: string; title: string; description?: string; action?: React.ReactNode; children: React.ReactNode };

function NavGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return <section className="nav-group"><p>{label}</p><div>{children}</div></section>;
}

export function AppShell({ organizationSlug, workspaceSlug, title, description, action, children }: ShellProps) {
  const base = `/${organizationSlug}`;
  const workspaceBase = workspaceSlug ? `${base}/${workspaceSlug}` : undefined;
  return <div className="app-frame">
    <header className="topbar"><Link className="brand" href="/"><span className="brand-mark" aria-hidden="true">G</span><span>GrowX AI</span></Link><div className="topbar-context"><span>GrowX Labs</span><span className="context-divider">/</span><span>{workspaceSlug ?? "Organization"}</span></div><div className="topbar-actions"><button className="command-trigger" type="button" aria-label="Open command palette"><span>Search</span><kbd>Ctrl K</kbd></button><button className="avatar-button" type="button" aria-label="Open profile menu">AL</button></div></header>
    <aside className="sidebar" aria-label="Primary navigation">
      <div className="switchers"><label>Organization<select defaultValue={organizationSlug}><option value={organizationSlug}>GrowX Labs</option></select></label><label>Workspace<select defaultValue={workspaceSlug ?? "all"}><option value="all">All workspaces</option>{workspaceSlug ? <option value={workspaceSlug}>{workspaceSlug}</option> : null}</select></label></div>
      <nav>
        <NavGroup label="Overview"><Link href={`${base}/overview`}>Overview</Link></NavGroup>
        {workspaceBase ? <><NavGroup label="Build"><Link href={`${workspaceBase}/playground`}>Playground</Link><Link href={`${workspaceBase}/models`}>Models</Link><Link href={`${workspaceBase}/api-keys`}>API keys</Link></NavGroup><NavGroup label="Observe"><Link href={`${workspaceBase}/logs`}>Logs</Link><Link href={`${workspaceBase}/usage`}>Usage</Link><Link href={`${workspaceBase}/analytics/routing`}>Analytics</Link></NavGroup><NavGroup label="Operate"><Link href={`${workspaceBase}/environments`}>Environments</Link><Link href={`${workspaceBase}/webhooks`}>Webhooks</Link><Link href={`${workspaceBase}/service-accounts`}>Service accounts</Link></NavGroup></> : null}
        <NavGroup label="Organization"><Link href={`${base}/workspaces`}>Workspaces</Link><Link href={`${base}/members`}>Team</Link><Link href={`${base}/audit`}>Audit</Link><Link href={`${base}/settings`}>Settings</Link></NavGroup>
      </nav>
      <div className="sidebar-footer"><span className="status-dot" aria-hidden="true" />All systems operational</div>
    </aside>
    <main className="main-content"><div className="content-inner"><header className="page-header"><div><h1>{title}</h1>{description ? <p>{description}</p> : null}</div>{action ? <div>{action}</div> : null}</header>{children}</div></main>
  </div>;
}

export function StatePanel({ title, detail, action }: { title: string; detail: string; action?: React.ReactNode }) { return <section className="state" role="status"><span className="state-icon" aria-hidden="true">◇</span><div><h2>{title}</h2><p>{detail}</p>{action}</div></section>; }
export function EnvironmentBadge({ type }: { type: "development" | "staging" | "production" }) { return <span className={`badge ${type}`}>{type}</span>; }
export function PermissionEditor() { return <fieldset><legend>Permissions</legend>{["models.read", "responses.create", "chat.completions.create", "embeddings.create", "usage.read"].map((scope) => <label className="check" key={scope}><input type="checkbox" name="permissions" value={scope} defaultChecked={["models.read", "responses.create"].includes(scope)} />{scope}</label>)}</fieldset>; }
export function ModelAccessEditor() { return <fieldset><legend>Model access</legend><label>Policy<select name="modelPolicy" defaultValue="all"><option value="all">All workspace models</option><option value="selected">Selected models only</option></select></label><label>Patterns<input name="models" placeholder="growx/fast, openai/*" /></label></fieldset>; }
export function RateLimitEditor() { return <fieldset><legend>Rate limits</legend><div className="form-grid"><label>Requests / minute<input type="number" name="rpm" min="1" defaultValue="60" /></label><label>Concurrent requests<input type="number" name="concurrency" min="1" defaultValue="5" /></label></div></fieldset>; }
export function SpendingLimitEditor() { return <fieldset><legend>Spending</legend><div className="form-grid"><label>Mode<select name="budgetMode" defaultValue="hard"><option value="warn">Warn only</option><option value="soft">Soft limit</option><option value="hard">Hard stop</option></select></label><label>Monthly limit (USD)<input type="number" name="budget" min="0" placeholder="500" /></label></div></fieldset>; }
export function IpAllowListEditor() { return <fieldset><legend>IP restrictions</legend><label>IPv4, IPv6, or CIDR entries<textarea name="ipAllowlist" rows={4} placeholder={"203.0.113.42\n203.0.113.0/24"} /></label><p className="muted">Leave empty to allow any IP.</p></fieldset>; }
