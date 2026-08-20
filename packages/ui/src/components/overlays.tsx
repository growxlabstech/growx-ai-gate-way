"use client";

import {
  useEffect,
  useId,
  useRef,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { cx } from "./primitives";
import { IconButton } from "./controls";
function useOverlay(open: boolean, onClose?: () => void) {
  const ref = useRef<HTMLElement>(null);
  const previous = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!open) return;
    previous.current = document.activeElement as HTMLElement;
    const body = document.body;
    const old = body.style.overflow;
    body.style.overflow = "hidden";
    const focus = () => {
      const el = ref.current?.querySelector<HTMLElement>(
        "[autofocus],button,[href],input,select,textarea,[tabindex]:not([tabindex='-1'])",
      );
      el?.focus();
    };
    focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose?.();
      }
      if (event.key === "Tab" && ref.current) {
        const items = [
          ...ref.current.querySelectorAll<HTMLElement>(
            "button,[href],input,select,textarea,[tabindex]:not([tabindex='-1'])",
          ),
        ].filter((item) => !item.hasAttribute("disabled"));
        const first = items[0];
        const last = items.at(-1);
        if (!first || !last) return;
        if (document.activeElement === last && !event.shiftKey) {
          event.preventDefault();
          first.focus();
        } else if (document.activeElement === first && event.shiftKey) {
          event.preventDefault();
          last.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      body.style.overflow = old;
      document.removeEventListener("keydown", key);
      previous.current?.focus();
    };
  }, [open, onClose]);
  return ref;
}
export function Tooltip({
  content,
  children,
}: {
  content: string;
  children: ReactNode;
}) {
  return (
    <span className="gx-tooltip" title={content} aria-label={content}>
      {children}
    </span>
  );
}
export function Dropdown({
  label,
  children,
}: {
  label: ReactNode;
  children: ReactNode;
}) {
  return (
    <details className="gx-dropdown">
      <summary>{label}</summary>
      <div role="menu">{children}</div>
    </details>
  );
}
export function Popover({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <aside className="gx-popover" role="dialog" aria-label={title ?? "Popover"}>
      {title ? <strong>{title}</strong> : null}
      {children}
    </aside>
  );
}
type OverlayProps = {
  open?: boolean;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose?: () => void;
};
function OverlayBody({
  titleId,
  title,
  description,
  children,
  footer,
  onClose,
}: OverlayProps & { titleId: string }) {
  return (
    <>
      <header>
        <div>
          <h2 id={titleId}>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        <IconButton
          icon="close"
          label="Close"
          variant="ghost"
          onClick={onClose}
        />
      </header>
      <div className="gx-overlay__body">{children}</div>
      {footer ? <footer>{footer}</footer> : null}
    </>
  );
}

export function Flyout({
  size = "standard",
  open = true,
  ...props
}: OverlayProps & { size?: "standard" | "technical" | "large" }) {
  const ref = useOverlay(open, props.onClose);
  const titleId = useId();

  if (!open || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      className="gx-overlay-backdrop"
      onMouseDown={(event) =>
        event.target === event.currentTarget && props.onClose?.()
      }
    >
      <aside
        ref={ref}
        className={cx("gx-overlay", "gx-flyout", `gx-flyout--${size}`)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <OverlayBody {...props} titleId={titleId} />
      </aside>
    </div>,
    document.body,
  );
}
export function Sheet(props: OverlayProps) {
  return <Flyout {...props} size="large" />;
}
export function Modal({
  size = "md",
  open = true,
  ...props
}: OverlayProps & { size?: "sm" | "md" | "lg" }) {
  const ref = useOverlay(open, props.onClose);
  const titleId = useId();

  if (!open || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      className="gx-overlay-backdrop"
      onMouseDown={(event) =>
        event.target === event.currentTarget && props.onClose?.()
      }
    >
      <section
        ref={ref}
        className={cx("gx-overlay", "gx-modal", `gx-modal--${size}`)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <OverlayBody {...props} titleId={titleId} />
      </section>
    </div>,
    document.body,
  );
}
export function AlertDialog(props: OverlayProps) {
  return <Modal {...props} size="sm" />;
}
export function Toast({
  tone = "information",
  title,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  tone?: "information" | "health" | "warning" | "critical";
  title: string;
  children?: ReactNode;
}) {
  return (
    <div
      {...props}
      className={cx("gx-toast", `gx-toast--${tone}`, props.className)}
      role={tone === "critical" ? "alert" : "status"}
    >
      <strong>{title}</strong>
      {children ? <div>{children}</div> : null}
    </div>
  );
}
