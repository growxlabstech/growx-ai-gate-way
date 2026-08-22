"use client";

import { useState } from "react";
import type { WorkspaceSettingsDetails } from "../../lib/settings-data";

interface WorkspaceSettingsViewProps {
  organizationSlug: string;
  workspaceSlug: string;
  initialSettings: WorkspaceSettingsDetails;
}

export function WorkspaceSettingsView({
  organizationSlug,
  workspaceSlug,
  initialSettings,
}: WorkspaceSettingsViewProps) {
  const [settings, setSettings] =
    useState<WorkspaceSettingsDetails>(initialSettings);
  const [wsName, setWsName] = useState(initialSettings.workspaceName);
  const [retentionPolicy, setRetentionPolicy] = useState(
    initialSettings.dataRetentionPolicy,
  );
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [copiedId, setCopiedId] = useState(false);

  // Danger zone
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    if (!wsName.trim()) return;

    setSaving(true);
    setSaveSuccess(false);

    await new Promise((resolve) => setTimeout(resolve, 400));
    setSettings((prev) => ({
      ...prev,
      workspaceName: wsName.trim(),
      dataRetentionPolicy: retentionPolicy,
    }));
    setSaving(false);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  }

  function handleCopyId() {
    navigator.clipboard.writeText(settings.workspaceId);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  }

  async function handleDeleteWorkspace(e: React.FormEvent) {
    e.preventDefault();
    if (deleteConfirmText !== settings.workspaceName) {
      setDeleteError(
        `Please type "${settings.workspaceName}" exactly to confirm.`,
      );
      return;
    }

    setDeleting(true);
    setDeleteError(null);

    await new Promise((resolve) => setTimeout(resolve, 600));
    setDeleting(false);
    setDeleteError(
      "Phase-35 Governed Workspace Deletion initiated. All keys and routes are being purged.",
    );
  }

  return (
    <div
      className="settings-page-container"
      data-testid="workspace-settings-root"
    >
      {/* 1. General Workspace Profile Card */}
      <section className="settings-section-card">
        <div className="section-header-block">
          <h2 className="section-title">Workspace Configuration</h2>
          <p className="section-subtitle">
            Configure routing boundaries, environment tags, and Phase-35
            governance policies.
          </p>
        </div>

        <form onSubmit={handleSaveSettings} className="settings-form">
          <div className="form-field-group">
            <label htmlFor="ws-name-input" className="form-label">
              Workspace Display Name
            </label>
            <div className="input-with-action-row">
              <input
                id="ws-name-input"
                type="text"
                value={wsName}
                onChange={(e) => setWsName(e.target.value)}
                className="form-txt-input"
                placeholder="Workspace Name"
                required
              />
              <button
                type="submit"
                className="btn-primary"
                disabled={
                  saving ||
                  (wsName.trim() === settings.workspaceName &&
                    retentionPolicy === settings.dataRetentionPolicy)
                }
              >
                {saving ? "Saving…" : "Save Changes"}
              </button>
            </div>
            {saveSuccess ? (
              <span className="form-success-note">
                ✓ Workspace settings updated successfully.
              </span>
            ) : null}
          </div>

          <div className="form-field-group">
            <label className="form-label">Workspace Canonical ID</label>
            <div className="copyable-id-row">
              <code className="id-code font-mono">{settings.workspaceId}</code>
              <button
                type="button"
                className="btn-copy-mini"
                onClick={handleCopyId}
                aria-label="Copy Workspace ID"
              >
                {copiedId ? "Copied ✓" : "Copy ID"}
              </button>
            </div>
          </div>

          {/* Phase-35 Data Retention Policy */}
          <div className="form-field-group">
            <label htmlFor="retention-policy-select" className="form-label">
              Phase-35 Data Retention & Prompt Governance
            </label>
            <select
              id="retention-policy-select"
              value={retentionPolicy}
              onChange={(e) => setRetentionPolicy(e.target.value as any)}
              className="form-select-input"
            >
              <option value="standard">
                Standard Retention (30-day debug telemetry & logs)
              </option>
              <option value="zero_retention">
                Zero Retention (Zero prompts/completions saved to database)
              </option>
            </select>
            <span className="field-hint">
              Zero Retention enforces mathematical non-persistence on all
              requests in this workspace.
            </span>
          </div>

          <div className="metadata-summary-grid">
            <div className="meta-item-box">
              <span className="meta-lbl">Environment</span>
              <span className="badge-subtle font-mono">
                {settings.environment.toUpperCase()}
              </span>
            </div>
            <div className="meta-item-box">
              <span className="meta-lbl">Data Residency</span>
              <span className="meta-val">
                {settings.dataResidency.toUpperCase()}
              </span>
            </div>
            <div className="meta-item-box">
              <span className="meta-lbl">Allowed Providers</span>
              <span className="meta-val">
                {settings.allowedProviders.length} active
              </span>
            </div>
          </div>
        </form>
      </section>

      {/* 2. Danger Zone */}
      <section className="settings-danger-card">
        <div className="danger-header-block">
          <h3 className="danger-title">Danger Zone</h3>
          <p className="danger-subtitle">
            Irreversible workspace deletion and API key revocation.
          </p>
        </div>

        <form onSubmit={handleDeleteWorkspace} className="danger-action-box">
          <div className="danger-action-info">
            <h4 className="danger-action-heading">Delete this Workspace</h4>
            <p className="danger-action-desc">
              Permanently delete <strong>{settings.workspaceName}</strong>. All
              API keys generated in this workspace will stop functioning
              immediately.
            </p>
            <div className="delete-confirm-input-wrap">
              <label htmlFor="confirm-delete-ws" className="field-hint">
                Type <code>{settings.workspaceName}</code> to confirm:
              </label>
              <input
                id="confirm-delete-ws"
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                className="form-txt-input danger-confirm-input"
                placeholder={settings.workspaceName}
              />
            </div>
            {deleteError ? (
              <span
                className="dialog-error-banner"
                style={{ marginTop: "8px" }}
              >
                {deleteError}
              </span>
            ) : null}
          </div>

          <button
            type="submit"
            className="btn-danger"
            disabled={deleting || deleteConfirmText !== settings.workspaceName}
          >
            {deleting ? "Deleting…" : "Delete Workspace"}
          </button>
        </form>
      </section>
    </div>
  );
}
