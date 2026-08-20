"use client";

import { useState } from "react";
import {
  privilegedCapabilities,
  type PrivilegedCapability,
} from "@growx/privileged-access";
import styles from "./step-up.module.css";

type CapabilityGroup = {
  name: string;
  description: string;
  capabilities: readonly PrivilegedCapability[];
};

const capabilityNames: Record<PrivilegedCapability, string> = {
  "ops.customer.read": "View customer records",
  "ops.request.inspect": "Inspect request metadata",
  "ops.request.content.read": "Read sensitive request content",
  "ops.provider.manage": "Manage AI providers",
  "ops.routing.manage": "Manage routing policies",
  "ops.billing.read": "View billing records",
  "ops.billing.adjust": "Apply billing adjustments",
  "ops.security.read": "View security posture",
  "ops.security.respond": "Respond to security events",
  "ops.incident.manage": "Manage incidents",
  "ops.feature_flag.manage": "Manage feature flags",
  "ops.support.session.create": "Create support sessions",
  "ops.audit.read": "View privileged audit trail",
};

const capabilityGroups: readonly CapabilityGroup[] = [
  {
    name: "Customer Access",
    description: "Customer records, support, and request investigation.",
    capabilities: [
      "ops.customer.read",
      "ops.request.inspect",
      "ops.request.content.read",
      "ops.support.session.create",
    ],
  },
  {
    name: "AI Infrastructure",
    description: "Provider connectivity, routing, and platform controls.",
    capabilities: [
      "ops.provider.manage",
      "ops.routing.manage",
      "ops.feature_flag.manage",
    ],
  },
  {
    name: "Finance",
    description: "Billing visibility and controlled adjustments.",
    capabilities: ["ops.billing.read", "ops.billing.adjust"],
  },
  {
    name: "Security",
    description: "Security investigation, response, and audit evidence.",
    capabilities: [
      "ops.security.read",
      "ops.security.respond",
      "ops.audit.read",
    ],
  },
  {
    name: "Operations",
    description: "Incident coordination and operational response.",
    capabilities: ["ops.incident.manage"],
  },
];

const displayedCapabilities = capabilityGroups.flatMap(
  (group) => group.capabilities,
);

if (
  displayedCapabilities.length !== privilegedCapabilities.length ||
  privilegedCapabilities.some(
    (capability) => !displayedCapabilities.includes(capability),
  )
) {
  throw new Error("Privileged capability presentation is incomplete");
}

export default function StepUpPage() {
  const [reason, setReason] = useState("");
  const [selectedCapabilities, setSelectedCapabilities] = useState<
    PrivilegedCapability[]
  >([]);
  const [approvalReference, setApprovalReference] = useState("");
  const [breakGlass, setBreakGlass] = useState(false);
  const [breakGlassAcknowledged, setBreakGlassAcknowledged] = useState(false);
  const [breakGlassConfirmation, setBreakGlassConfirmation] = useState("");
  const [status, setStatus] = useState<
    "idle" | "submitting" | "success" | "error"
  >("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [capabilityError, setCapabilityError] = useState("");

  const isSubmitting = status === "submitting";
  const breakGlassConfirmed =
    breakGlassAcknowledged && breakGlassConfirmation === "BREAK GLASS";

  function toggleCapability(capability: PrivilegedCapability) {
    setCapabilityError("");

    setSelectedCapabilities((current) => {
      if (current.includes(capability)) {
        return current.filter((item) => item !== capability);
      }

      return [...current, capability];
    });
  }

  function toggleBreakGlass() {
    setBreakGlass((current) => {
      if (current) {
        setBreakGlassAcknowledged(false);
        setBreakGlassConfirmation("");
      }

      return !current;
    });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (reason.trim().length < 10) {
      setErrorMessage(
        "Please enter a detailed reason (at least 10 characters).",
      );
      return;
    }

    if (selectedCapabilities.length === 0) {
      setCapabilityError("Select at least one required capability.");
      return;
    }

    if (breakGlass && !breakGlassConfirmed) {
      setErrorMessage(
        "Acknowledge the emergency impact and enter BREAK GLASS to continue.",
      );
      return;
    }

    setStatus("submitting");
    setErrorMessage("");
    setCapabilityError("");

    try {
      const response = await fetch("/v1/auth/privileged/step-up", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reason: reason.trim(),
          capabilities: selectedCapabilities,
          approvalReference: approvalReference.trim() || undefined,
          breakGlass,
        }),
      });

      if (response.ok) {
        setStatus("success");
        const urlParams = new URLSearchParams(window.location.search);
        const returnTo = urlParams.get("returnTo") ?? "/admin/users";
        window.location.assign(returnTo);
        return;
      }

      const data = await response.json().catch(() => ({}));
      setErrorMessage(
        data.error ?? "Step-up authentication failed. Please try again.",
      );
      setStatus("error");
    } catch {
      setErrorMessage("Network or server error during step-up elevation.");
      setStatus("error");
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.card} aria-labelledby="step-up-title">
        <header className={styles.header}>
          <span className={styles.eyebrow}>SECURITY ELEVATION</span>
          <h1 id="step-up-title">Privileged Operations Step-Up</h1>
          <p>
            Access requires a short-lived Just-In-Time session, a verified
            operator reason, and explicit capability scope. All actions are
            audited.
          </p>
        </header>

        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.field}>
            <label htmlFor="operator-reason">Operator reason</label>
            <small id="operator-reason-hint">
              Required · Include the operational task or incident context.
            </small>
            <textarea
              id="operator-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Describe the operational task or incident ticket requiring access…"
              rows={3}
              required
              disabled={isSubmitting}
              aria-describedby="operator-reason-hint"
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="approval-reference">
              Approval / ticket reference
            </label>
            <small id="approval-reference-hint">
              Optional for standard elevation.
            </small>
            <input
              id="approval-reference"
              type="text"
              value={approvalReference}
              onChange={(event) => setApprovalReference(event.target.value)}
              placeholder="e.g. INC-84920 or PR-204"
              disabled={isSubmitting}
              aria-describedby="approval-reference-hint"
            />
          </div>

          <section
            aria-labelledby="capabilities-title"
            aria-describedby={
              capabilityError
                ? "capabilities-hint capabilities-error"
                : "capabilities-hint"
            }
          >
            <h2 className={styles.sectionLabel} id="capabilities-title">
              Requested capabilities
            </h2>
            <p className={styles.sectionHint} id="capabilities-hint">
              Select only the permissions required for this JIT session.
            </p>

            {capabilityError ? (
              <p
                className={styles.capabilityError}
                id="capabilities-error"
                role="alert"
              >
                {capabilityError}
              </p>
            ) : null}

            <div className={styles.groups}>
              {capabilityGroups.map((group) => (
                <section className={styles.group} key={group.name}>
                  <header className={styles.groupHeader}>
                    <h3>{group.name}</h3>
                    <p>{group.description}</p>
                  </header>

                  <div className={styles.tiles}>
                    {group.capabilities.map((capability) => {
                      const selected =
                        selectedCapabilities.includes(capability);

                      return (
                        <button
                          className={`${styles.permissionTile} ${
                            selected ? styles.permissionTileSelected : ""
                          }`}
                          key={capability}
                          type="button"
                          role="checkbox"
                          aria-checked={selected}
                          disabled={isSubmitting}
                          onClick={() => toggleCapability(capability)}
                        >
                          <span className={styles.permissionCopy}>
                            <strong>{capabilityNames[capability]}</strong>
                            <code>{capability}</code>
                          </span>
                          <span
                            className={styles.selectionIndicator}
                            aria-hidden="true"
                          >
                            {selected ? "✓" : ""}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          </section>

          <section
            className={styles.dangerSection}
            aria-labelledby="break-glass-title"
          >
            <div className={styles.dangerHeader}>
              <div>
                <span className={styles.dangerEyebrow}>EMERGENCY ACCESS</span>
                <h2 id="break-glass-title">Emergency Break-Glass</h2>
                <p>
                  Bypasses the standard approval reference and triggers a
                  high-severity audit event. Use only during an active
                  emergency.
                </p>
              </div>

              <button
                className={styles.switch}
                type="button"
                role="switch"
                aria-checked={breakGlass}
                aria-label="Enable Emergency Break-Glass"
                disabled={isSubmitting}
                onClick={toggleBreakGlass}
              >
                <span aria-hidden="true" />
              </button>
            </div>

            {breakGlass ? (
              <div className={styles.dangerConfirmation}>
                <label className={styles.acknowledgement}>
                  <input
                    type="checkbox"
                    checked={breakGlassAcknowledged}
                    onChange={(event) =>
                      setBreakGlassAcknowledged(event.target.checked)
                    }
                    disabled={isSubmitting}
                  />
                  <span>
                    I understand this creates emergency privileged access and a
                    high-severity audit record.
                  </span>
                </label>

                <div className={styles.confirmationField}>
                  <label htmlFor="break-glass-confirmation">
                    Type <code>BREAK GLASS</code> to confirm
                  </label>
                  <input
                    id="break-glass-confirmation"
                    value={breakGlassConfirmation}
                    onChange={(event) =>
                      setBreakGlassConfirmation(event.target.value)
                    }
                    autoComplete="off"
                    spellCheck={false}
                    disabled={isSubmitting}
                  />
                </div>
              </div>
            ) : null}
          </section>

          {errorMessage ? (
            <div className={styles.error} role="alert">
              {errorMessage}
            </div>
          ) : null}

          <button
            className={styles.submitButton}
            type="submit"
            disabled={isSubmitting || (breakGlass && !breakGlassConfirmed)}
          >
            {isSubmitting
              ? "Granting JIT Session…"
              : "Grant 15-Minute Privileged Session →"}
          </button>
        </form>
      </section>
    </main>
  );
}
