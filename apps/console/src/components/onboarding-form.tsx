"use client";

import { FormEvent, useState } from "react";

type CreationResult = { organizationSlug: string; workspaceSlug: string };

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 63);
}

export function OnboardingForm({
  mode,
  email,
  organizationId,
  organizationName,
}: {
  mode: "organization" | "workspace";
  email: string;
  organizationId?: string | undefined;
  organizationName?: string | undefined;
}) {
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const cleanName = name.trim();
    const slug = slugify(cleanName);
    if (cleanName.length < 2 || slug.length < 2) {
      setError(
        `${mode === "organization" ? "Organization" : "Workspace"} name must contain at least two letters or numbers.`,
      );
      return;
    }
    setPending(true);
    setError("");
    try {
      const body =
        mode === "organization"
          ? {
              name: cleanName,
              slug,
              workspaceName: "Default Workspace",
              workspaceSlug: "default",
            }
          : { organizationId, name: cleanName, slug };
      const response = await fetch(`/api/onboarding/${mode}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = (await response.json()) as CreationResult & {
        error?: { message?: string };
      };
      if (!response.ok)
        throw new Error(
          result.error?.message ?? `${mode} could not be created.`,
        );
      window.location.replace(
        `/${result.organizationSlug}/${result.workspaceSlug}/overview`,
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Setup could not be completed. Try again.",
      );
      setPending(false);
    }
  }

  const label =
    mode === "organization" ? "Organization name" : "Workspace name";
  return (
    <main className="onboarding-shell">
      <section className="onboarding-card">
        <p className="eyebrow">Account setup</p>
        <h1>
          {mode === "organization"
            ? "Create your organization"
            : "Create your workspace"}
        </h1>
        <p>
          {mode === "organization"
            ? "This creates your organization and default workspace."
            : `Finish setup for ${organizationName ?? "your organization"}.`}
        </p>
        <form className="onboarding-form" onSubmit={submit}>
          <label htmlFor="onboarding-name">{label}</label>
          <input
            id="onboarding-name"
            name="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoComplete="organization"
            autoFocus
            disabled={pending}
            aria-describedby={error ? "onboarding-error" : undefined}
          />
          <div className="onboarding-identity">
            <span>Signed in as</span>
            <strong>{email}</strong>
          </div>
          {error ? (
            <p className="auth-error" id="onboarding-error" role="alert">
              {error}
            </p>
          ) : null}
          <button className="auth-primary" type="submit" disabled={pending}>
            {pending
              ? "Creating…"
              : mode === "organization"
                ? "Create organization"
                : "Create workspace"}
            <span aria-hidden="true">→</span>
          </button>
        </form>
      </section>
    </main>
  );
}
