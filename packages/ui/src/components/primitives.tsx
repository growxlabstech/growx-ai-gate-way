import type { CSSProperties, HTMLAttributes, ReactNode } from "react";

export type GxSpace = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
const cx = (...values: Array<string | false | null | undefined>) =>
  values.filter(Boolean).join(" ");

export function Text({
  as: Tag = "p",
  tone = "primary",
  variant = "body",
  className,
  ...props
}: HTMLAttributes<HTMLElement> & {
  as?: "p" | "span" | "strong" | "small" | "code";
  tone?:
    | "primary"
    | "secondary"
    | "muted"
    | "ice"
    | "health"
    | "warning"
    | "critical";
  variant?:
    | "display"
    | "page"
    | "section"
    | "panel"
    | "body"
    | "dense"
    | "label"
    | "metadata"
    | "micro"
    | "code";
}) {
  return (
    <Tag
      className={cx(
        "gx-text",
        `gx-text--${variant}`,
        `gx-text--${tone}`,
        className,
      )}
      {...props}
    />
  );
}
export function Divider(props: HTMLAttributes<HTMLHRElement>) {
  return <hr {...props} className={cx("gx-divider", props.className)} />;
}
export function Surface({
  level = "primary",
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  level?: "canvas" | "shell" | "primary" | "raised" | "hover";
}) {
  return (
    <div
      {...props}
      className={cx("gx-surface", `gx-surface--${level}`, className)}
    />
  );
}
export function Stack({
  gap = 4,
  className,
  style,
  ...props
}: HTMLAttributes<HTMLDivElement> & { gap?: GxSpace }) {
  return (
    <div
      {...props}
      className={cx("gx-stack", className)}
      style={
        {
          "--gx-stack-gap": `var(--gx-space-${gap})`,
          ...style,
        } as CSSProperties
      }
    />
  );
}
export function Inline({
  gap = 2,
  align = "center",
  className,
  style,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  gap?: GxSpace;
  align?: "start" | "center" | "end" | "baseline";
}) {
  return (
    <div
      {...props}
      className={cx("gx-inline", className)}
      style={
        {
          "--gx-inline-gap": `var(--gx-space-${gap})`,
          "--gx-inline-align": align,
          ...style,
        } as CSSProperties
      }
    />
  );
}
export function Container({
  width = "operational",
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  width?: "operational" | "form" | "full";
}) {
  return (
    <div
      {...props}
      className={cx("gx-container", `gx-container--${width}`, className)}
    />
  );
}
export function Grid({
  columns = 12,
  className,
  style,
  ...props
}: HTMLAttributes<HTMLDivElement> & { columns?: number }) {
  return (
    <div
      {...props}
      className={cx("gx-grid", className)}
      style={{ "--gx-grid-columns": columns, ...style } as CSSProperties}
    />
  );
}
export function VisuallyHidden({ children }: { children: ReactNode }) {
  return <span className="gx-sr-only">{children}</span>;
}
export { cx };
