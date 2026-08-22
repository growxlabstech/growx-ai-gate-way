"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { GxIcon, type GxIconName } from "@growx/ui";

type NavigationItem = {
  id: string;
  label: string;
  href: string;
  icon: GxIconName;
  metadata?: string;
};

type NavigationSection = {
  id: string;
  label?: string;
  items: readonly NavigationItem[];
};

const navigation: readonly NavigationSection[] = [
  {
    id: "overview",
    items: [
      {
        id: "overview",
        label: "Overview",
        href: "/admin",
        icon: "home",
      },
    ],
  },
  {
    id: "access",
    label: "Access",
    items: [
      {
        id: "users",
        label: "Users",
        href: "/admin/users",
        icon: "organization",
      },
      {
        id: "organizations",
        label: "Organizations",
        href: "/admin/organizations",
        icon: "organization",
      },
      {
        id: "workspaces",
        label: "Workspaces",
        href: "/admin/workspaces",
        icon: "workspace",
      },
    ],
  },
  {
    id: "ai-infrastructure",
    label: "AI Infrastructure",
    items: [
      {
        id: "providers",
        label: "Providers",
        href: "/admin/providers",
        icon: "provider",
      },
      {
        id: "models",
        label: "Models",
        href: "/admin/models",
        icon: "model",
      },
      {
        id: "routing",
        label: "Routing",
        href: "/admin/routing",
        icon: "routing",
      },
    ],
  },
  {
    id: "operations",
    label: "Operations",
    items: [
      {
        id: "security-events",
        label: "Security events",
        href: "/admin/security-events",
        icon: "security",
      },
      {
        id: "audit-events",
        label: "Audit events",
        href: "/admin/audit-events",
        icon: "audit",
      },
      { id: "cache", label: "Cache", href: "/admin/cache", icon: "log" },
    ],
  },
];

function isActive(pathname: string, href: string) {
  return href === "/admin"
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminSidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setCollapsed(
        window.localStorage.getItem("growx:admin-sidebar") === "collapsed",
      );
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(
      "growx:admin-sidebar",
      collapsed ? "collapsed" : "expanded",
    );
  }, [collapsed]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setMobileOpen(false));
    return () => window.cancelAnimationFrame(frame);
  }, [pathname]);

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMobileOpen(false);
      }
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

  return (
    <>
      <button
        className="ops-mobile-menu"
        type="button"
        onClick={() => setMobileOpen(true)}
        aria-label="Open navigation"
      >
        ☰
      </button>

      <aside
        className={`ops-sidebar${collapsed ? " is-collapsed" : ""}${
          mobileOpen ? " is-mobile-open" : ""
        }`}
        aria-label="Privileged operations navigation"
      >
        <div className="ops-sidebar__brand">
          <Link
            className="ops-sidebar__brand-link"
            href="/admin"
            aria-label="GrowX AI privileged operations home"
          >
            <span className="brand-mark" aria-hidden="true">
              G
            </span>
            <span className="ops-sidebar__brand-copy">
              <strong>GROWX AI</strong>
              <small>PRIVILEGED</small>
            </span>
          </Link>
          <button
            className="ops-sidebar__collapse"
            type="button"
            onClick={() => setCollapsed((value) => !value)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? "→" : "←"}
          </button>
        </div>

        <nav className="ops-sidebar__nav">
          {navigation.map((section) => (
            <section className="ops-nav-group" key={section.id}>
              {section.label ? <p>{section.label}</p> : null}
              <div>
                {section.items.map((item) => {
                  const active = isActive(pathname, item.href);

                  return (
                    <Link
                      className={`ops-nav-item${active ? " is-active" : ""}`}
                      href={item.href}
                      key={item.id}
                      aria-current={active ? "page" : undefined}
                      title={collapsed ? item.label : undefined}
                    >
                      <GxIcon name={item.icon} size={16} />
                      <span className="ops-nav-item__label">{item.label}</span>
                      {item.metadata ? <small>{item.metadata}</small> : null}
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </nav>

        <div className="ops-sidebar__footer">
          <span className="ops-sidebar__plane">GrowxLabs operator plane</span>
        </div>

        <button
          className="ops-mobile-close"
          type="button"
          onClick={() => setMobileOpen(false)}
          aria-label="Close navigation"
        >
          ×
        </button>
      </aside>
    </>
  );
}
