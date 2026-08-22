import Image from "next/image";
import {
  ButtonHTMLAttributes,
  ChangeEvent,
  forwardRef,
  InputHTMLAttributes,
  ReactNode,
} from "react";

export function AuthShell({
  children,
  artwork,
}: {
  children: ReactNode;
  artwork: ReactNode;
}) {
  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <div className="auth-content">{children}</div>
      </section>
      {artwork}
    </main>
  );
}

export function AuthCardFrame({ children }: { children: ReactNode }) {
  return <div className="auth-card">{children}</div>;
}

export function AuthArtwork() {
  return (
    <aside className="auth-visual" aria-hidden="true">
      <Image
        src="/growx-auth-crystal.png"
        alt=""
        fill
        priority
        sizes="(min-width: 769px) 58vw, 0px"
      />
    </aside>
  );
}

type AuthFieldProps = InputHTMLAttributes<HTMLInputElement> & { label: string };
export const AuthField = forwardRef<HTMLInputElement, AuthFieldProps>(
  function AuthField({ label, id, ...props }, ref) {
    return (
      <label className="auth-field" htmlFor={id}>
        <span>{label}</span>
        <span className="auth-field-control">
          <input ref={ref} id={id} {...props} />
        </span>
      </label>
    );
  },
);

export const OtpInput = forwardRef<
  HTMLInputElement,
  {
    value: string;
    onChange(value: string): void;
    disabled?: boolean;
    invalid?: boolean;
    describedBy?: string;
  }
>(function OtpInput({ value, onChange, disabled, invalid, describedBy }, ref) {
  function change(event: ChangeEvent<HTMLInputElement>) {
    onChange(event.target.value.replace(/\D/g, "").slice(0, 6));
  }
  return (
    <label className="otp-field">
      <span>VERIFICATION CODE</span>
      <span className="otp-control">
        <input
          ref={ref}
          value={value}
          onChange={change}
          disabled={disabled}
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={6}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          aria-label="Six digit verification code"
        />
        <span className="otp-cells" aria-hidden="true">
          {Array.from({ length: 6 }, (_, index) => (
            <span
              className={index === value.length ? "current" : ""}
              key={index}
            >
              {value[index] ?? ""}
            </span>
          ))}
        </span>
      </span>
    </label>
  );
});

export function AuthPrimaryAction({
  busy,
  busyLabel,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  busy: boolean;
  busyLabel: string;
}) {
  return (
    <button
      className="auth-primary"
      type="submit"
      disabled={busy || props.disabled}
      aria-busy={busy}
      {...props}
    >
      <span>{busy ? busyLabel : children}</span>
      <span className="auth-progress" aria-hidden="true" />
    </button>
  );
}

export function AuthDivider() {
  return (
    <div className="auth-divider" aria-hidden="true">
      <span>OR</span>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.9h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.4Z"
      />
      <path
        fill="currentColor"
        opacity=".72"
        d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 .9-3.4.9-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22Z"
      />
      <path
        fill="currentColor"
        opacity=".5"
        d="M6.4 13.9a6 6 0 0 1 0-3.8V7.5H3.1a10 10 0 0 0 0 9l3.3-2.6Z"
      />
      <path
        fill="currentColor"
        opacity=".88"
        d="M12 6c1.5 0 2.8.5 3.8 1.5l2.9-2.8A9.7 9.7 0 0 0 3.1 7.5l3.3 2.6C7.2 7.8 9.4 6 12 6Z"
      />
    </svg>
  );
}
function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 2a10 10 0 0 0-3.2 19.5c.5.1.7-.2.7-.5v-1.9c-2.8.6-3.4-1.2-3.4-1.2-.5-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 0 1.6 1 1.6 1 .9 1.6 2.4 1.1 2.9.9.1-.7.4-1.1.7-1.3-2.3-.3-4.7-1.1-4.7-5A3.9 3.9 0 0 1 6.7 8c-.1-.3-.5-1.3.1-2.7 0 0 .9-.3 2.8 1a9.6 9.6 0 0 1 5.1 0c2-1.3 2.8-1 2.8-1 .6 1.4.2 2.4.1 2.7a3.9 3.9 0 0 1 1.1 2.7c0 3.9-2.4 4.7-4.7 5 .4.3.7 1 .7 2V21c0 .3.2.6.7.5A10 10 0 0 0 12 2Z"
      />
    </svg>
  );
}

export function OAuthButton({
  provider,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  provider: "google" | "github";
}) {
  const label = provider === "google" ? "Google" : "GitHub";
  return (
    <button
      className="oauth-button"
      type="button"
      aria-label={`Continue with ${label}`}
      {...props}
    >
      {provider === "google" ? <GoogleIcon /> : <GitHubIcon />}
      <span>{label}</span>
    </button>
  );
}

export function AuthStatus({
  id,
  error,
  message,
  requestId,
}: {
  id: string;
  error: string;
  message: string;
  requestId?: string | null;
}) {
  if (error)
    return (
      <p id={id} className="auth-error" role="alert">
        {error}
        {requestId ? <small> Request ID: {requestId}</small> : null}
      </p>
    );
  return (
    <p id={id} className="auth-success" role="status" aria-live="polite">
      {message}
    </p>
  );
}
