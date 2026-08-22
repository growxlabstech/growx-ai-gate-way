"use client";

import { useState } from "react";

export function InvitationAcceptance({
  token,
  email,
}: {
  token: string;
  email: string;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function accept() {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/invitations/accept", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const result = (await response.json()) as {
        organizationSlug?: string;
        workspaceSlug?: string | null;
        error?: { message?: string };
      };
      if (!response.ok)
        throw new Error(
          result.error?.message ?? "Invitation could not be accepted.",
        );
      window.location.replace(
        result.organizationSlug && result.workspaceSlug
          ? `/${result.organizationSlug}/${result.workspaceSlug}/overview`
          : "/onboarding",
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Invitation could not be accepted.",
      );
      setPending(false);
    }
  }

  return (
    <main className="onboarding-shell">
      <section className="onboarding-card">
        <p className="eyebrow">Organization invitation</p>
        <h1>Join your GrowX workspace</h1>
        <p>Accept the invitation using the signed-in account below.</p>
        <div className="onboarding-identity">
          <span>Signed in as</span>
          <strong>{email}</strong>
        </div>
        {error ? (
          <p className="auth-error" role="alert">
            {error}
          </p>
        ) : null}
        <button
          className="auth-primary"
          type="button"
          onClick={accept}
          disabled={pending}
        >
          {pending ? "Accepting…" : "Accept invitation"}
          <span aria-hidden="true">→</span>
        </button>
      </section>
    </main>
  );
}
