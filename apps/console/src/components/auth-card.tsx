"use client";

import Link from "next/link";
import { FormEvent, useEffect, useId, useRef, useState } from "react";
import { describeAuthProblem } from "../lib/auth-flow";
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
export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+$/.test(normalizeEmail(value));
}

class AuthRequestError extends Error {
  constructor(message: string, readonly retryAfterSeconds: number | null, readonly terminal: boolean, readonly requestId: string | null) { super(message); }
}

async function authRequest(path: string, body: Readonly<Record<string, string>>): Promise<unknown> {
  const response = await fetch(`${authBase}${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const problem = describeAuthProblem(response.status, payload, response.headers.get("retry-after"));
    throw new AuthRequestError(problem.message, problem.retryAfterSeconds, problem.terminal, problem.requestId);
  }
  return payload;
}

export function AuthCard({ mode, returnTo, enabledProviders = [], initialError = "" }: { mode: AuthMode; returnTo?: string | null; enabledProviders?: Provider[]; initialError?: string }) {
  const [email, setEmail] = useState("");
  const [flow, setFlow] = useState<Flow>(mode === "verify-email" ? "verification" : "form");
  const [busy, setBusy] = useState(false);
  const [otp, setOtp] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(initialError);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [verificationLocked, setVerificationLocked] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const otpRef = useRef<HTMLInputElement>(null);
  const verificationFormRef = useRef<HTMLFormElement>(null);
  const lastSubmittedOtp = useRef("");
  const statusId = useId();
  const isRecovery = mode === "forgot-password" || mode === "reset-password";

  const clearStatus = () => { setError(""); setMessage(""); setRequestId(null); };
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
      setCooldown(60);
      setMessage("Verification code sent.");
      requestAnimationFrame(() => otpRef.current?.focus());
    } catch (cause) {
      const problem = cause instanceof AuthRequestError ? cause : new AuthRequestError("Authentication is temporarily unavailable. Please try again.", null, false, null);
      setError(problem.message);
      setRequestId(problem.requestId);
      if (problem.retryAfterSeconds) setCooldown(problem.retryAfterSeconds);
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
      setCooldown(60);
      setOtp("");
      lastSubmittedOtp.current = "";
      setVerificationLocked(false);
      setMessage("A new verification code was sent.");
    } catch (cause) {
      const problem = cause instanceof AuthRequestError ? cause : new AuthRequestError("Authentication is temporarily unavailable. Please try again.", null, false, null);
      setError(problem.message);
      setRequestId(problem.requestId);
      if (problem.retryAfterSeconds) setCooldown(problem.retryAfterSeconds);
    } finally {
      setBusy(false);
    }
  }

  async function verifyOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearStatus();
    if (otp.length !== 6) { setError("Enter the six-digit verification code."); otpRef.current?.focus(); return; }
    if (verificationLocked || lastSubmittedOtp.current === otp) return;
    lastSubmittedOtp.current = otp;
    setBusy(true);
    try {
      await authRequest("/sign-in/email-otp", { email, otp });
      setMessage("Verified. Loading your workspace…");
      const resolution = await fetch("/api/auth/resolve", { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ returnTo: returnTo ?? null }) });
      const payload = await resolution.json().catch(() => null) as { destination?: unknown } | null;
      if (!resolution.ok || typeof payload?.destination !== "string") throw new AuthRequestError("Your session was created, but workspace context is temporarily unavailable. Try again.", null, false, null);
      window.location.replace(payload.destination);
    } catch (cause) {
      const problem = cause instanceof AuthRequestError ? cause : new AuthRequestError("Authentication is temporarily unavailable. Please try again.", null, false, null);
      setError(problem.message);
      setRequestId(problem.requestId);
      setVerificationLocked(problem.terminal);
      if (problem.retryAfterSeconds) setCooldown(problem.retryAfterSeconds);
      if (!problem.terminal) lastSubmittedOtp.current = "";
      requestAnimationFrame(() => otpRef.current?.focus());
    } finally { setBusy(false); }
  }

  async function social(provider: Provider) {
    clearStatus();
    setBusy(true);
    try {
      const callbackURL = returnTo ? `/sign-in?returnTo=${encodeURIComponent(returnTo)}` : "/sign-in";
      const payload = await authRequest("/sign-in/social", { provider, callbackURL }) as { url?: unknown } | null;
      if (!payload || typeof payload.url !== "string") throw new Error("This provider is not configured right now.");
      window.location.assign(payload.url);
    } catch (cause) {
      const problem = cause instanceof AuthRequestError ? cause : new AuthRequestError("This provider is unavailable right now.", null, false, null);
      setError(problem.message);
      setRequestId(problem.requestId);
      setBusy(false);
    }
  }

  function changeEmail() {
    setFlow("form");
    setOtp("");
    lastSubmittedOtp.current = "";
    setVerificationLocked(false);
    clearStatus();
    requestAnimationFrame(() => emailRef.current?.focus());
  }

  const title = flow === "verification" ? "Verify email" : isRecovery ? "Email sign-in" : "Sign in";
  const subtitle = flow === "verification" ? "Enter the code sent to continue." : "Use your email to sign in or create an account.";

  return (
    <AuthShell artwork={<AuthArtwork />}>
      <Link className="auth-brand" href="/" aria-label="GrowX AI home"><span aria-hidden="true" className="auth-brand-mark" />GROWX AI</Link>
      <AuthCardFrame>
        <div className="auth-state" key={flow}>
          <header className="auth-heading"><h1>{title}</h1><p>{subtitle}</p></header>
          {flow === "verification" ? (
            <form ref={verificationFormRef} className="auth-verification" aria-labelledby="verification-email" onSubmit={verifyOtp} noValidate>
              <div className="auth-email-summary"><span>Code sent to</span><strong id="verification-email">{email || "your email address"}</strong><button type="button" onClick={changeEmail}>Change</button></div>
              <OtpInput ref={otpRef} value={otp} onChange={(value) => { setOtp(value); clearStatus(); if (value.length === 6 && !busy && !verificationLocked) requestAnimationFrame(() => verificationFormRef.current?.requestSubmit()); }} disabled={busy || verificationLocked} invalid={Boolean(error)} describedBy={statusId} />
              <p className="auth-verification-note">The code expires after 10 minutes. {cooldown > 0 ? `Resend available in ${cooldown}s.` : "You can request a new code."}</p>
              <AuthStatus id={statusId} error={error} message={message} requestId={requestId} />
              <AuthPrimaryAction busy={busy} busyLabel="Verifying…" disabled={verificationLocked}>Verify <span aria-hidden="true">→</span></AuthPrimaryAction>
              <button className="auth-resend" type="button" disabled={busy || cooldown > 0} onClick={resend}>{cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}</button>
            </form>
          ) : (
            <>
              <form className="auth-form" onSubmit={submitEmail} noValidate>
                <AuthField ref={emailRef} id="auth-email" label="EMAIL" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" autoComplete="email" inputMode="email" disabled={busy} aria-invalid={Boolean(error)} aria-describedby={statusId} />
                <AuthStatus id={statusId} error={error} message={message} requestId={requestId} />
                <AuthPrimaryAction busy={busy} busyLabel="Sending code…">Continue <span aria-hidden="true">→</span></AuthPrimaryAction>
              </form>
              {enabledProviders.length > 0 ? <><AuthDivider /><div className="auth-social">{enabledProviders.map((provider) => <OAuthButton key={provider} provider={provider} disabled={busy} onClick={() => social(provider)} />)}</div></> : null}
              {!isRecovery ? <p className="auth-switch">New to GrowX? Continuing with email creates your account.</p> : null}
            </>
          )}
        </div>
      </AuthCardFrame>
    </AuthShell>
  );
}
