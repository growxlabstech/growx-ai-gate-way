import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "./primitives";
import { GxIcon, type GxIconName } from "./icons";
export function Card({
  variant = "standard",
  ...props
}: HTMLAttributes<HTMLElement> & {
  variant?: "standard" | "summary" | "action";
}) {
  return (
    <article
      {...props}
      className={cx("gx-card", `gx-card--${variant}`, props.className)}
    />
  );
}
export function InteractiveCard(props: HTMLAttributes<HTMLElement>) {
  return (
    <article
      {...props}
      tabIndex={props.tabIndex ?? 0}
      className={cx("gx-card", "gx-card--interactive", props.className)}
    />
  );
}
export function MetricCard({
  label,
  value,
  context,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  context?: ReactNode;
  tone?: "neutral" | "health" | "warning" | "critical";
}) {
  return (
    <article className={cx("gx-metric-card", `gx-metric-card--${tone}`)}>
      <span>{label}</span>
      <strong>{value}</strong>
      {context ? <small>{context}</small> : null}
    </article>
  );
}
export function Panel(props: HTMLAttributes<HTMLElement>) {
  return <section {...props} className={cx("gx-panel", props.className)} />;
}
export function Callout({
  tone = "information",
  icon = "warning",
  title,
  children,
}: {
  tone?: "information" | "health" | "warning" | "critical";
  icon?: GxIconName;
  title: string;
  children: ReactNode;
}) {
  return (
    <aside className={cx("gx-callout", `gx-callout--${tone}`)}>
      <GxIcon name={icon} />
      <div>
        <strong>{title}</strong>
        <div>{children}</div>
      </div>
    </aside>
  );
}
export function Banner({
  tone = "information",
  children,
}: {
  tone?: "information" | "health" | "warning" | "critical";
  children: ReactNode;
}) {
  return (
    <div
      className={cx("gx-banner", `gx-banner--${tone}`)}
      role={tone === "critical" ? "alert" : "status"}
    >
      {children}
    </div>
  );
}
export function Inspector({
  title,
  meta,
  children,
}: {
  title: string;
  meta?: ReactNode;
  children: ReactNode;
}) {
  return (
    <aside className="gx-inspector">
      <header>
        <div>
          <span>Inspector</span>
          <h2>{title}</h2>
        </div>
        {meta}
      </header>
      {children}
    </aside>
  );
}
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="gx-page-header">
      <div>
        {eyebrow ? <span>{eyebrow}</span> : null}
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? (
        <div className="gx-page-header__actions">{actions}</div>
      ) : null}
    </header>
  );
}
export function Toolbar(props: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={cx("gx-toolbar", props.className)} />;
}
