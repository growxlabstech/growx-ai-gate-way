"use client";

import Link from "next/link";
import { useState } from "react";
import type { ConsoleApiKey } from "../../lib/api-keys-data";
import { SecretRevealModal } from "./secret-reveal-modal";
import { RevokeKeyDialog } from "./revoke-key-dialog";

interface ApiKeyDetailViewProps {
  apiKey: ConsoleApiKey;
  organizationSlug: string;
  workspaceSlug: string;
  workspaceId: string;
}

export function ApiKeyDetailView({
  apiKey: initialKey,
  organizationSlug,
  workspaceSlug,
  workspaceId,
}: ApiKeyDetailViewProps) {
  const [apiKey, setApiKey] = useState<ConsoleApiKey>(initialKey);
  const [secretToReveal, setSecretToReveal] = useState<string | null>(null);
  const [revealedKeyName, setRevealedKeyName] = useState<string>("");
  const [isRevokeOpen, setIsRevokeOpen] = useState(false);
  const [isRevoking, setIsRevoking] = useState(false);
  const [copiedPrefix, setCopiedPrefix] = useState(false);

  const base = `/${organizationSlug}/${workspaceSlug}/api-keys`;
  const isActive = apiKey.status === "active";
  const isRevoked = apiKey.status === "revoked";

  async function handleCopyPrefix() {
    try {
      await navigator.clipboard.writeText(apiKey.prefix);
      setCopiedPrefix(true);
      setTimeout(() => setCopiedPrefix(false), 2000);
    } catch {
      setCopiedPrefix(true);
    }
  }

  async function handleRevokeConfirm() {
    setIsRevoking(true);
    try {
      const response = await fetch(
        `/api/workspaces/${workspaceId}/api-keys/${apiKey.id}`,
        {
          method: "DELETE",
        },
      );

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error ?? "Failed to revoke API key");
      }

      const { data } = await response.json();
      setApiKey(data);
      setIsRevokeOpen(false);
    } finally {
      setIsRevoking(false);
    }
  }

  async function handleRotate() {
    if (
      !confirm(
        `Rotate API key '${apiKey.name}'? A new secret will be created and this key will be revoked.`,
      )
    ) {
      return;
    }

    try {
      const response = await fetch(
        `/api/workspaces/${workspaceId}/api-keys/${apiKey.id}/rotate`,
        {
          method: "POST",
        },
      );

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error ?? "Failed to rotate API key");
      }

      const { apiKey: newKey, secret, oldApiKey } = await response.json();
      setApiKey(oldApiKey);
      setRevealedKeyName(newKey.name);
      setSecretToReveal(secret);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Rotation failed");
    }
  }

  return (
    <div className="key-detail-container">
      <div className="detail-breadcrumb">
        <Link href={base} className="back-link">
          ← Back to API keys
        </Link>
      </div>

      <div className="detail-header-card">
        <div className="detail-header-main">
          <div className="detail-title-wrap">
            <h2 className="detail-title">{apiKey.name}</h2>
            <div className="detail-badges">
              <span className={`env-tag env-${apiKey.environment}`}>
                {apiKey.environment}
              </span>
              {isActive ? (
                <span className="status-pill status-healthy">Active</span>
              ) : isRevoked ? (
                <span className="status-pill status-danger">Revoked</span>
              ) : (
                <span className="status-pill status-warning">Expired</span>
              )}
            </div>
          </div>

          <div className="prefix-bar">
            <span className="prefix-label">Public Prefix:</span>
            <code className="prefix-code">{apiKey.prefix}</code>
            <button
              type="button"
              className="btn-ghost btn-xs"
              onClick={handleCopyPrefix}
            >
              {copiedPrefix ? "Copied ✓" : "Copy"}
            </button>
          </div>
        </div>

        {isActive ? (
          <div className="detail-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={handleRotate}
            >
              Rotate key
            </button>
            <button
              type="button"
              className="btn-danger"
              onClick={() => setIsRevokeOpen(true)}
            >
              Revoke key
            </button>
          </div>
        ) : null}
      </div>

      <div className="detail-grid">
        <section className="detail-panel">
          <h3 className="panel-title">Credential Metadata</h3>
          <dl className="metadata-dl">
            <div className="dl-row">
              <dt>Key Identifier</dt>
              <dd>
                <code>{apiKey.id}</code>
              </dd>
            </div>
            <div className="dl-row">
              <dt>Created</dt>
              <dd>{new Date(apiKey.createdAt).toLocaleString()}</dd>
            </div>
            <div className="dl-row">
              <dt>Created By</dt>
              <dd>
                <code>{apiKey.createdBy}</code>
              </dd>
            </div>
            <div className="dl-row">
              <dt>Last Used</dt>
              <dd>
                {apiKey.lastUsedAt
                  ? new Date(apiKey.lastUsedAt).toLocaleString()
                  : "Never used"}
              </dd>
            </div>
            <div className="dl-row">
              <dt>Expires</dt>
              <dd>
                {apiKey.expiresAt
                  ? new Date(apiKey.expiresAt).toLocaleString()
                  : "Never (No expiry)"}
              </dd>
            </div>
            {isRevoked ? (
              <div className="dl-row dl-revoked">
                <dt>Revoked At</dt>
                <dd>
                  {apiKey.revokedAt
                    ? new Date(apiKey.revokedAt).toLocaleString()
                    : "Yes"}
                </dd>
              </div>
            ) : null}
          </dl>
        </section>

        <section className="detail-panel">
          <h3 className="panel-title">Permission Scopes</h3>
          <p className="panel-subtitle">
            Capabilities authorized for this credential.
          </p>
          <div className="detail-scopes-list">
            {apiKey.permissions.map((scope) => (
              <div key={scope} className="detail-scope-item">
                <span className="scope-check">✓</span>
                <code>{scope}</code>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="security-notice-card">
        <h4>Security & Audit Guarantees</h4>
        <p>
          Raw API key secrets are never stored on disk or recoverable in
          plaintext. Every authenticated request using this key is logged with
          its caller prefix and checked against active workspace rate limits.
        </p>
      </div>

      {/* Single-view Secret Reveal Modal */}
      <SecretRevealModal
        isOpen={Boolean(secretToReveal)}
        secret={secretToReveal}
        keyName={revealedKeyName}
        onClose={() => {
          setSecretToReveal(null);
          setRevealedKeyName("");
        }}
      />

      {/* Revocation Confirmation Dialog */}
      <RevokeKeyDialog
        isOpen={isRevokeOpen}
        apiKey={apiKey}
        onClose={() => setIsRevokeOpen(false)}
        onConfirm={handleRevokeConfirm}
        isRevoking={isRevoking}
      />
    </div>
  );
}
