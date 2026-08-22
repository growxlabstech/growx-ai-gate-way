"use client";

import { useState } from "react";
import type { OrganizationSettingsDetails } from "../../lib/settings-data";

interface OrganizationSettingsViewProps {
  organizationSlug: string;
  initialSettings: OrganizationSettingsDetails;
}

export function OrganizationSettingsView({
  organizationSlug,
  initialSettings,
}: OrganizationSettingsViewProps) {
  const [settings, setSettings] =
    useState<OrganizationSettingsDetails>(initialSettings);
  const [orgName, setOrgName] = useState(initialSettings.organizationName);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [copiedId, setCopiedId] = useState(false);

  // Danger zone delete state
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleSaveName(e: React.FormEvent) {
    e.preventDefault();
    if (!orgName.trim()) return;

    setSaving(true);
    setSaveSuccess(false);

    // Simulate backend mutation
    await new Promise((resolve) => setTimeout(resolve, 400));
    setSettings((prev) => ({ ...prev, organizationName: orgName.trim() }));
    setSaving(false);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  }

  function handleCopyId() {
    navigator.clipboard.writeText(settings.organizationId);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  }

  async function handleDeleteOrg(e: React.FormEvent) {
    e.preventDefault();
    if (deleteConfirmText !== settings.organizationName) {
      setDeleteError(
        `Please type "${settings.organizationName}" exactly to confirm.`,
      );
      return;
    }

    setDeleting(true);
    setDeleteError(null);

    // Governed Phase-35 deletion
    await new Promise((resolve) => setTimeout(resolve, 600));
    setDeleting(false);
    setDeleteError(
      "Phase-35 Governed Deletion scheduled. You will be redirected upon completion.",
    );
  }

  return (
    <div className="settings-page-container" data-testid="org-settings-root">
      {/* 1. General Profile Card */}
      <section className="settings-section-card">
        <div className="section-header-block">
          <h2 className="section-title">Organization Profile</h2>
          <p className="section-subtitle">
            Manage your organization's display identity and canonical metadata.
          </p>
        </div>

        <form onSubmit={handleSaveName} className="settings-form">
          <div className="form-field-group">
            <label htmlFor="org-name-input" className="form-label">
              Organization Name
            </label>
            <div className="input-with-action-row">
              <input
                id="org-name-input"
                type="text"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                className="form-txt-input"
                placeholder="Organization Name"
                required
              />
              <button
                type="submit"
                className="btn-primary"
                disabled={
                  saving || orgName.trim() === settings.organizationName
                }
              >
                {saving ? "Saving…" : "Save Changes"}
              </button>
            </div>
            {saveSuccess ? (
              <span className="form-success-note">
                ✓ Organization name updated successfully.
              </span>
            ) : null}
          </div>

          <div className="form-field-group">
            <label className="form-label">Organization Public ID</label>
            <div className="copyable-id-row">
              <code className="id-code font-mono">
                {settings.organizationId}
              </code>
              <button
                type="button"
                className="btn-copy-mini"
                onClick={handleCopyId}
                aria-label="Copy Organization ID"
              >
                {copiedId ? "Copied ✓" : "Copy ID"}
              </button>
            </div>
            <span className="field-hint">
              Used in API client initialization and support tickets.
            </span>
          </div>

          <div className="metadata-summary-grid">
            <div className="meta-item-box">
              <span className="meta-lbl">URL Slug</span>
              <code className="meta-val font-mono">
                {settings.organizationSlug}
              </code>
            </div>
            <div className="meta-item-box">
              <span className="meta-lbl">Commercial Tier</span>
              <span className="badge-success">{settings.tier}</span>
            </div>
            <div className="meta-item-box">
              <span className="meta-lbl">Primary Owner</span>
              <span className="meta-val">{settings.ownerEmail}</span>
            </div>
            <div className="meta-item-box">
              <span className="meta-lbl">Workspaces</span>
              <span className="meta-val">
                {settings.totalWorkspaces} active
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
            Irreversible actions governed by Phase-35 data retention and
            deletion policies.
          </p>
        </div>

        <form onSubmit={handleDeleteOrg} className="danger-action-box">
          <div className="danger-action-info">
            <h4 className="danger-action-heading">Delete this Organization</h4>
            <p className="danger-action-desc">
              Permanently schedule deletion for{" "}
              <strong>{settings.organizationName}</strong>, including all
              workspaces, API keys, and configurations. Active billing must be
              settled before deletion.
            </p>
            <div className="delete-confirm-input-wrap">
              <label htmlFor="confirm-delete-org" className="field-hint">
                Type <code>{settings.organizationName}</code> to confirm:
              </label>
              <input
                id="confirm-delete-org"
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                className="form-txt-input danger-confirm-input"
                placeholder={settings.organizationName}
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
            disabled={
              deleting || deleteConfirmText !== settings.organizationName
            }
          >
            {deleting ? "Scheduling Deletion…" : "Delete Organization"}
          </button>
        </form>
      </section>
    </div>
  );
}
