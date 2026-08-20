import { AdminSidebar } from "./admin-sidebar";

export function AdminShell({ title, description, action, children }: { title: string; description?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return <div className="ops-frame"><AdminSidebar /><main className="ops-main"><div className="ops-content"><header className="page-header"><div><h1>{title}</h1>{description ? <p>{description}</p> : null}</div>{action}</header>{children}</div></main></div>;
}

export function AdminTable({ subject, emptyDetail, action }: { subject: string; emptyDetail?: string; action?: React.ReactNode }) {
  return <section><div className="filters"><label className="search-field"><span className="sr-only">Search {subject.toLowerCase()}</span><input type="search" placeholder={`Search ${subject.toLowerCase()}…`} /></label><button type="button">Filters</button></div><div className="empty" role="status"><span className="empty-icon" aria-hidden="true">◇</span><div><h2>No {subject.toLowerCase()} found</h2><p>{emptyDetail ?? "Clear filters or change your search."}</p>{action}</div></div></section>;
}
