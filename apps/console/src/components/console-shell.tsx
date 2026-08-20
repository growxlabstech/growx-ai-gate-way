"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { startTransition, useEffect, useId, useRef, useState } from "react";
import { initialsForUser, isNavigationActive, switchWorkspacePath, workspacesForOrganization, type ConsoleOrganization, type ConsoleWorkspace, type TenantContext } from "../lib/tenant-context";

type NavigationGroup = { label: string; items: { label: string; href: string }[] };

function navigationFor(organizationSlug: string, workspaceSlug?: string): NavigationGroup[] {
  const organizationBase = `/${organizationSlug}`;
  const workspaceBase = workspaceSlug ? `${organizationBase}/${workspaceSlug}` : undefined;
  return [
    { label: "Home", items: [{ label: workspaceBase ? "Workspace overview" : "Organization overview", href: workspaceBase ? `${workspaceBase}/overview` : `${organizationBase}/overview` }] },
    ...(workspaceBase ? [
      { label: "Build", items: [{ label: "Playground", href: `${workspaceBase}/playground` }, { label: "Models", href: `${workspaceBase}/models` }, { label: "API keys", href: `${workspaceBase}/api-keys` }] },
      { label: "Observe", items: [{ label: "Logs", href: `${workspaceBase}/logs` }, { label: "Usage", href: `${workspaceBase}/usage` }, { label: "Routing analytics", href: `${workspaceBase}/analytics/routing` }] },
      { label: "Workspace", items: [{ label: "Billing", href: `${workspaceBase}/billing` }, { label: "Members", href: `${workspaceBase}/members` }, { label: "Webhooks", href: `${workspaceBase}/webhooks` }, { label: "Service accounts", href: `${workspaceBase}/service-accounts` }, { label: "Settings", href: `${workspaceBase}/settings` }] },
    ] : []),
    { label: "Organization", items: [{ label: "Workspaces", href: `${organizationBase}/workspaces` }, { label: "Members", href: `${organizationBase}/members` }, { label: "Teams", href: `${organizationBase}/teams` }, { label: "Invitations", href: `${organizationBase}/invitations` }, { label: "Audit", href: `${organizationBase}/audit` }, { label: "Settings", href: `${organizationBase}/settings` }] },
  ];
}

export function ConsoleShell({ context, activeOrganization, activeWorkspace, title, description, action, children }: { context: TenantContext; activeOrganization: ConsoleOrganization; activeWorkspace: ConsoleWorkspace | undefined; title: string; description: string | undefined; action: React.ReactNode | undefined; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [switchingTo, setSwitchingTo] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const accountMenuId = useId();
  const mobileTrigger = useRef<HTMLButtonElement>(null);
  const accountTrigger = useRef<HTMLButtonElement>(null);
  const previousPathname = useRef(pathname);
  const workspaces = workspacesForOrganization(context, activeOrganization.organizationId);
  const navigation = navigationFor(activeOrganization.organizationSlug, activeWorkspace?.workspaceSlug);

  useEffect(() => {
    if (previousPathname.current === pathname) return;
    previousPathname.current = pathname;
    const frame = requestAnimationFrame(() => { setMobileOpen(false); setSwitchingTo(null); });
    return () => cancelAnimationFrame(frame);
  }, [pathname]);
  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (accountOpen) { setAccountOpen(false); accountTrigger.current?.focus(); }
      else if (mobileOpen) { setMobileOpen(false); mobileTrigger.current?.focus(); }
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [accountOpen, mobileOpen]);

  function switchWorkspace(nextWorkspaceSlug: string) {
    if (!nextWorkspaceSlug || nextWorkspaceSlug === activeWorkspace?.workspaceSlug) return;
    setSwitchingTo(nextWorkspaceSlug);
    const destination = switchWorkspacePath(pathname, activeOrganization.organizationSlug, activeWorkspace?.workspaceSlug, nextWorkspaceSlug);
    startTransition(() => router.push(destination));
  }

  function switchOrganization(nextOrganizationSlug: string) {
    if (nextOrganizationSlug === activeOrganization.organizationSlug) return;
    setSwitchingTo(nextOrganizationSlug);
    startTransition(() => router.push(`/${nextOrganizationSlug}/overview`));
  }

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      const response = await fetch("/api/auth/sign-out", { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: "{}" });
      if (!response.ok) throw new Error("Sign out failed");
      window.location.replace("/sign-in");
    } catch { setSigningOut(false); }
  }

  return <div className="app-frame">
    <header className="topbar">
      <button ref={mobileTrigger} className="mobile-navigation-trigger" type="button" onClick={() => setMobileOpen(true)} aria-label="Open primary navigation" aria-expanded={mobileOpen}>Menu</button>
      <Link className="brand" href={`/${activeOrganization.organizationSlug}/overview`} aria-label="GrowX AI console home"><span className="brand-mark" aria-hidden="true">G</span><span>GrowX AI</span></Link>
      <div className="topbar-context" aria-label="Current context"><strong>{activeOrganization.organizationName}</strong>{activeWorkspace ? <><span aria-hidden="true">/</span><span>{switchingTo ? "Switching…" : activeWorkspace.workspaceName}</span></> : null}</div>
      <div className="topbar-actions">
        <button ref={accountTrigger} className="avatar-button" type="button" onClick={() => setAccountOpen((value) => !value)} aria-label="Open account menu" aria-expanded={accountOpen} aria-controls={accountMenuId}>{initialsForUser(context.user)}</button>
        {accountOpen ? <div className="account-menu" id={accountMenuId} role="menu" aria-label="Account">
          <div className="account-menu__identity">{context.user.name ? <strong>{context.user.name}</strong> : null}<span>{context.user.email}</span></div>
          <Link role="menuitem" href={`/${activeOrganization.organizationSlug}/settings`} onClick={() => setAccountOpen(false)}>Organization settings</Link>
          <button role="menuitem" type="button" onClick={signOut} disabled={signingOut}>{signingOut ? "Signing out…" : "Sign out"}</button>
        </div> : null}
      </div>
    </header>
    {mobileOpen ? <button className="navigation-backdrop" type="button" onClick={() => setMobileOpen(false)} aria-label="Close primary navigation" /> : null}
    <aside className={`sidebar${mobileOpen ? " is-mobile-open" : ""}`} aria-label="Console navigation">
      <div className="switchers">
        <label><span>Organization</span><select value={activeOrganization.organizationSlug} onChange={(event) => switchOrganization(event.target.value)} disabled={Boolean(switchingTo)}>{context.organizations.map((organization) => <option key={organization.organizationId} value={organization.organizationSlug}>{organization.organizationName}</option>)}</select></label>
        <label><span>Workspace</span><select value={switchingTo && workspaces.some((workspace) => workspace.workspaceSlug === switchingTo) ? switchingTo : activeWorkspace?.workspaceSlug ?? ""} onChange={(event) => switchWorkspace(event.target.value)} disabled={Boolean(switchingTo) || workspaces.length === 0}>{!activeWorkspace ? <option value="">Select a workspace</option> : null}{workspaces.map((workspace) => <option key={workspace.workspaceId} value={workspace.workspaceSlug}>{workspace.workspaceName}</option>)}</select></label>
      </div>
      <nav aria-label="Primary navigation">{navigation.map((group) => <section className="nav-group" key={group.label}><p>{group.label}</p><div>{group.items.map((item) => { const active = isNavigationActive(pathname, item.href); return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={active ? "is-active" : undefined} onClick={() => setMobileOpen(false)}>{item.label}</Link>; })}</div></section>)}</nav>
      <div className="sidebar-footer"><span>{activeOrganization.organizationName}</span><small>{activeWorkspace ? activeWorkspace.workspaceName : `${workspaces.length} workspace${workspaces.length === 1 ? "" : "s"}`}</small></div>
    </aside>
    <main className="main-content" id="main-content"><div className="content-inner"><header className="page-header"><div><h1>{title}</h1>{description ? <p>{description}</p> : null}</div>{action ? <div className="page-header__actions">{action}</div> : null}</header>{children}</div></main>
  </div>;
}
