import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "./primitives";
export type StatusTone =
  "neutral" | "ice" | "health" | "warning" | "critical" | "information";
export function Badge({
  tone = "neutral",
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: StatusTone }) {
  return (
    <span
      {...props}
      className={cx("gx-badge", `gx-tone--${tone}`, className)}
    />
  );
}
export function Chip(
  props: HTMLAttributes<HTMLSpanElement> & { tone?: StatusTone },
) {
  return <Badge {...props} className={cx("gx-chip", props.className)} />;
}
export function Pill(
  props: HTMLAttributes<HTMLSpanElement> & { tone?: StatusTone },
) {
  return <Badge {...props} className={cx("gx-pill", props.className)} />;
}
export function StatusDot({
  tone = "neutral",
  label,
}: {
  tone?: StatusTone;
  label?: string;
}) {
  return (
    <span
      className={cx("gx-status-dot", `gx-tone--${tone}`)}
      role={label ? "img" : undefined}
      aria-label={label}
    />
  );
}
export function HealthIndicator({
  tone = "health",
  children,
}: {
  tone?: Exclude<StatusTone, "ice">;
  children: ReactNode;
}) {
  return (
    <span className="gx-health-indicator">
      <StatusDot tone={tone} />
      {children}
    </span>
  );
}
export function Progress({
  value,
  label = "Progress",
}: {
  value: number;
  label?: string;
}) {
  return (
    <div
      className="gx-progress"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
    >
      <span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}
export function Meter({
  value,
  min = 0,
  max = 100,
  label = "Meter",
}: {
  value: number;
  min?: number;
  max?: number;
  label?: string;
}) {
  return (
    <meter
      className="gx-meter"
      value={value}
      min={min}
      max={max}
      aria-label={label}
    />
  );
}
