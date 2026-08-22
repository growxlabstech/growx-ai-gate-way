import type {
  ButtonHTMLAttributes,
  FieldsetHTMLAttributes,
  InputHTMLAttributes,
  LabelHTMLAttributes,
  OptionHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { cx } from "./primitives";
import { GxIcon, type GxIconName } from "./icons";

export type ControlSize = "xs" | "sm" | "md" | "lg";
export type ButtonVariant =
  "primary" | "secondary" | "ghost" | "danger" | "link";
export function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  className,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ControlSize;
  loading?: boolean;
}) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        "gx-button",
        `gx-button--${variant}`,
        `gx-control--${size}`,
        className,
      )}
    >
      {loading ? <span className="gx-button__spinner" /> : null}
      {children}
    </button>
  );
}
export function IconButton({
  icon,
  label,
  size = "md",
  variant = "secondary",
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  icon: GxIconName;
  label: string;
  size?: ControlSize;
  variant?: ButtonVariant;
}) {
  return (
    <Button
      {...props}
      size={size}
      variant={variant}
      className={cx("gx-icon-button", props.className)}
      aria-label={label}
    >
      <GxIcon name={icon} />
    </Button>
  );
}
export function ButtonGroup({ children }: { children: ReactNode }) {
  return (
    <div className="gx-button-group" role="group">
      {children}
    </div>
  );
}
export function Field({
  label,
  description,
  error,
  optional,
  children,
  ...props
}: FieldsetHTMLAttributes<HTMLFieldSetElement> & {
  label: string;
  description?: string;
  error?: string;
  optional?: boolean;
  children: ReactNode;
}) {
  return (
    <fieldset
      {...props}
      className={cx("gx-field", error && "gx-field--error", props.className)}
    >
      <legend>
        {label}
        {optional ? <span>Optional</span> : null}
      </legend>
      {description ? <p>{description}</p> : null}
      {children}
      {error ? <small role="alert">{error}</small> : null}
    </fieldset>
  );
}
const inputClass = (error?: boolean, className?: string) =>
  cx("gx-input", error && "gx-input--error", className);
export function Input({
  error,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { error?: boolean }) {
  return (
    <input
      {...props}
      aria-invalid={error || undefined}
      className={inputClass(error, props.className)}
    />
  );
}
export function SearchInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="gx-search-input">
      <GxIcon name="search" />
      <Input {...props} type="search" />
    </label>
  );
}
export function PasswordInput(
  props: InputHTMLAttributes<HTMLInputElement> & { error?: boolean },
) {
  return <Input {...props} type="password" />;
}
export function NumberInput(
  props: InputHTMLAttributes<HTMLInputElement> & { error?: boolean },
) {
  return <Input {...props} type="number" />;
}
export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cx("gx-input", "gx-textarea", props.className)}
    />
  );
}
export function Select({
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="gx-select-wrap">
      <select
        {...props}
        className={cx("gx-input", "gx-select", props.className)}
      >
        {children}
      </select>
      <GxIcon name="chevron" size={16} />
    </span>
  );
}
export function Combobox(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <Select {...props} />;
}
export function Option(props: OptionHTMLAttributes<HTMLOptionElement>) {
  return <option {...props} />;
}
export function Checkbox({
  label,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode }) {
  return (
    <label className="gx-choice">
      <input {...props} type="checkbox" />
      <span aria-hidden="true" />
      <em>{label}</em>
    </label>
  );
}
export function Radio({
  label,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode }) {
  return (
    <label className="gx-choice gx-choice--radio">
      <input {...props} type="radio" />
      <span aria-hidden="true" />
      <em>{label}</em>
    </label>
  );
}
export function Switch({
  label,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode }) {
  return (
    <label className="gx-switch">
      <input {...props} type="checkbox" role="switch" />
      <span aria-hidden="true" />
      <em>{label}</em>
    </label>
  );
}
export function Slider(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cx("gx-slider", props.className)}
      type="range"
    />
  );
}
export function SegmentedControl({
  label = "View",
  children,
}: {
  label?: string;
  children: ReactNode;
}) {
  return (
    <div className="gx-segmented" role="group" aria-label={label}>
      {children}
    </div>
  );
}
export function Segment({
  active = false,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      {...props}
      type="button"
      aria-pressed={active}
      className={cx("gx-segment", props.className)}
    />
  );
}
export function SearchField(props: InputHTMLAttributes<HTMLInputElement>) {
  return <SearchInput {...props} />;
}
export function FilterButton(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <Button {...props}>
      <GxIcon name="filter" /> {props.children ?? "Filters"}
    </Button>
  );
}
