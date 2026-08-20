"use client";

import Link from "next/link";
import { FormEvent, useEffect, useId, useRef, useState } from "react";
import {
  AuthArtwork,
  AuthCardFrame,
  AuthDivider,
  AuthField,
  AuthPrimaryAction,
  AuthShell,
  AuthStatus,
  OAuthButton,
  OtpInput,
} from "./auth-primitives";

export type AuthMode = "sign-in" | "sign-up" | "verify-email" | "forgot-password" | "reset-password";
type Flow = "form" | "verification";
type Provider = "google" | "github";

const authBase = "/api/auth";
const destination = "/select-organization";

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));
}

function friendlyError(status: number): string {
  if (status === 400 || status === 422) return "Check your email address and try again.";
  if (status === 401 || status === 403) return "This authentication request could not be approved.";
  if (status === 408 || status === 410) return "This sign-in link has expired. Request a new one.";
  if (status === 429) return "Too many attempts. Please wait before trying again.";
  if (status >= 500) return "Authentication is temporarily unavailable. Please try again.";
  return "Authentication could not be completed. Please try again.";
}

async function authRequest(path: string, body: Readonly<Record<string, string>>): Promise<unknown> {
  const response = await fetch(`${authBase}${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(friendlyError(response.status));
  return payload;
}

export function AuthCard({ mode }: { mode: AuthMode }) {
  const [email, setEmail] = useState("");
  const [flow, setFlow] = useState<Flow>(mode === "verify-email" ? "verification" : "form");
  const [busy, setBusy] = useState(false);
  const [otp, setOtp] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const emailRef = useRef<HTMLInputElement>(null);
  const otpRef = useRef<HTMLInputElement>(null);
  const statusId = useId();
  const isSignIn = mode === "sign-in";
  const isSignUp = mode === "sign-up";
  const isRecovery = mode === "forgot-password" || mode === "reset-password";

  const clearStatus = () => { setError(""); setMessage(""); };
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  async function submitEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearStatus();
    const normalized = normalizeEmail(email);
    if (!isValidEmail(normalized)) {
      setError("Enter a valid email address.");
      emailRef.current?.focus();
      return;
    }
    setBusy(true);
    try {
      if (isRecovery) {
        setError("Password recovery is unavailable from the passwordless sign-in experience.");
        return;
      }
      await authRequest("/email-otp/send-verification-otp", { email: normalized, type: "sign-in" });
      setEmail(normalized);
      setFlow("verification");
      setCooldown(30);
      setMessage("Verification code sent.");
      requestAnimationFrame(() => otpRef.current?.focus());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : friendlyError(500));
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (cooldown > 0) return;
    clearStatus();
    setBusy(true);
    try {
      await authRequest("/email-otp/send-verification-otp", { email, type: "sign-in" });
      setCooldown(30);
      setOtp("");
      setMessage("A new verification code was sent.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : friendlyError(500));
    } finally {
      setBusy(false);
    }
  }

  async function verifyOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearStatus();
    if (otp.length !== 6) { setError("Enter the six-digit verification code."); otpRef.current?.focus(); return; }
    setBusy(true);
    try {
      await authRequest("/sign-in/email-otp", { email, otp });
      setMessage("Verified. Redirecting…");
      window.location.assign(destination);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : friendlyError(500));
      setOtp("");
      requestAnimationFrame(() => otpRef.current?.focus());
    } finally { setBusy(false); }
  }

  async function social(provider: Provider) {
    clearStatus();
    setBusy(true);
    try {
      const payload = await authRequest("/sign-in/social", { provider, callbackURL: destination }) as { url?: unknown } | null;
      if (!payload || typeof payload.url !== "string") throw new Error("This provider is not configured right now.");
      window.location.assign(payload.url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : friendlyError(500));
      setBusy(false);
    }
  }

  function changeEmail() {
    setFlow("form");
    setOtp("");
    clearStatus();
    requestAnimationFrame(() => emailRef.current?.focus());
  }

  const title = flow === "verification" ? "VERIFY EMAIL" : isSignUp ? "CREATE ACCOUNT" : isSignIn ? "WELCOME BACK" : "EMAIL SIGN-IN";
  const subtitle = flow === "verification" ? "Enter the secure code we sent to continue." : "Enter your email to continue.";

  return (
    <AuthShell artwork={<AuthArtwork />}>
      <Link className="auth-brand" href="/" aria-label="GrowX AI home"><span aria-hidden="true" className="auth-brand-mark" />GROWX AI</Link>
      <AuthCardFrame>
        <div className="auth-state" key={flow}>
          <header className="auth-heading"><h1>{title}</h1><p>{subtitle}</p></header>
          {flow === "verification" ? (
            <form className="auth-verification" aria-labelledby="verification-email" onSubmit={verifyOtp} noValidate>
              <div className="auth-email-summary"><span>Code sent to</span><strong id="verification-email">{email || "your email address"}</strong><button type="button" onClick={changeEmail}>Change</button></div>
              <OtpInput ref={otpRef} value={otp} onChange={setOtp} disabled={busy} invalid={Boolean(error)} />
              <p className="auth-verification-note">The code expires after 10 minutes. {cooldown > 0 ? `Resend available in ${cooldown}s.` : "You can request a new code."}</p>
              <AuthStatus id={statusId} error={error} message={message} />
              <AuthPrimaryAction busy={busy} busyLabel="Verifying…">Verify <span aria-hidden="true">→</span></AuthPrimaryAction>
              <button className="auth-resend" type="button" disabled={busy || cooldown > 0} onClick={resend}>{cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}</button>
            </form>
          ) : (
            <>
              <form className="auth-form" onSubmit={submitEmail} noValidate>
                <AuthField ref={emailRef} id="auth-email" label="EMAIL" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" autoComplete="email" inputMode="email" disabled={busy} aria-invalid={Boolean(error)} aria-describedby={statusId} />
                <AuthStatus id={statusId} error={error} message={message} />
                <AuthPrimaryAction busy={busy} busyLabel="Sending code…">Continue <span aria-hidden="true">→</span></AuthPrimaryAction>
              </form>
              <AuthDivider />
              <div className="auth-social">
                <OAuthButton provider="google" disabled={busy} onClick={() => social("google")} />
                <OAuthButton provider="github" disabled={busy} onClick={() => social("github")} />
              </div>
              <p className="auth-switch">{isSignIn ? "Need an account?" : "Already have an account?"} <Link href={isSignIn ? "/sign-up" : "/sign-in"}>{isSignIn ? "Create one" : "Sign in"}</Link></p>
            </>
          )}
        </div>
      </AuthCardFrame>
    </AuthShell>
  );
}
