"use client";

import Link from "next/link";
import { useState } from "react";
import type { ConsoleApiKey, CreateApiKeyInput } from "../../lib/api-keys-data";
import { CreateApiKeyDialog } from "./create-api-key-dialog";
import { SecretRevealModal } from "./secret-reveal-modal";
import { RevokeKeyDialog } from "./revoke-key-dialog";

interface ApiKeysManagerProps {
  initialKeys: ConsoleApiKey[];
  organizationSlug: string;
  workspaceSlug: string;
  workspaceId: string;
}

export function ApiKeysManager({
  initialKeys,
  organizationSlug,
  workspaceSlug,
  workspaceId,
}: ApiKeysManagerProps) {
  const [keys, setKeys] = useState<ConsoleApiKey[]>(initialKeys);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Display-once secret state - destroyed immediately when modal closes!
  const [secretToReveal, setSecretToReveal] = useState<string | null>(null);
  const [revealedKeyName, setRevealedKeyName] = useState<string>("");

  // Revoke modal state
  const [keyToRevoke, setKeyToRevoke] = useState<ConsoleApiKey | null>(null);
  const [isRevoking, setIsRevoking] = useState(false);

  // Search filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedPrefixId, setCopiedPrefixId] = useState<string | null>(null);

  const base = `/${organizationSlug}/${workspaceSlug}/api-keys`;

  async function handleCreateKey(input: CreateApiKeyInput) {
    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/api-keys`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error ?? "Failed to create API key");
      }

      const { apiKey, secret } = await response.json();
      setKeys((prev) => [apiKey, ...prev]);
      setIsCreateOpen(false);
      setRevealedKeyName(apiKey.name);
      setSecretToReveal(secret);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRevokeConfirm() {
    if (!keyToRevoke) return;
    setIsRevoking(true);
    try {
      const response = await fetch(
        `/api/workspaces/${workspaceId}/api-keys/${keyToRevoke.id}`,
        {
          method: "DELETE",
        },
      );

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error ?? "Failed to revoke API key");
      }

      const { data } = await response.json();
      setKeys((prev) => prev.map((k) => (k.id === data.id ? data : k)));
      setKeyToRevoke(null);
    } finally {
      setIsRevoking(false);
    }
  }

  async function handleRotateKey(key: ConsoleApiKey) {
    if (
      !confirm(
        `Rotate API key '${key.name}'? A new key secret will be created and the old key revoked.`,
      )
    ) {
      return;
    }

    try {
      const response = await fetch(
        `/api/workspaces/${workspaceId}/api-keys/${key.id}/rotate`,
        {
          method: "POST",
        },
      );

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error ?? "Failed to rotate API key");
      }

      const { apiKey, secret, oldApiKey } = await response.json();
      setKeys((prev) => [
        apiKey,
        ...prev.map((k) => (k.id === oldApiKey.id ? oldApiKey : k)),
      ]);
      setRevealedKeyName(apiKey.name);
      setSecretToReveal(secret);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Rotation failed");
    }
  }

  async function handleCopyPrefix(keyId: string, prefix: string) {
    try {
      await navigator.clipboard.writeText(prefix);
      setCopiedPrefixId(keyId);
      setTimeout(() => setCopiedPrefixId(null), 2000);
    } catch {
      setCopiedPrefixId(keyId);
    }
  }

  function handleCloseSecretModal() {
    // Crucial security requirement: clear raw secret from state immediately upon close
    setSecretToReveal(null);
    setRevealedKeyName("");
  }

  const filteredKeys = keys.filter((k) => {
    if (!searchQuery.trim()) return true;
    const term = searchQuery.toLowerCase().trim();
    return (
      k.name.toLowerCase().includes(term) ||
      k.prefix.toLowerCase().includes(term) ||
      k.id.toLowerCase().includes(term) ||
      k.permissions.some((p) => p.toLowerCase().includes(term))
    );
  });

  const activeCount = keys.filter((k) => k.status === "active").length;

  return (
    <div className="api-keys-manager-container">
      <div className="toolbar-row">
        <div className="toolbar-left">
          <button
            type="button"
            className="btn-primary"
            onClick={() => setIsCreateOpen(true)}
          >
            Create API key
          </button>
          <span className="keys-count-badge">
            {activeCount} active key{activeCount === 1 ? "" : "s"}
          </span>
        </div>

        {keys.length > 0 ? (
          <div className="toolbar-search">
            <input
              type="search"
              placeholder="Search keys or scopes…"
              className="search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search API keys"
            />
          </div>
        ) : null}
      </div>

      {keys.length === 0 ? (
        <div className="empty-keys-state">
          <div className="empty-icon" aria-hidden="true">
            🔑
          </div>
          <h3>No API keys yet</h3>
          <p>
            Create an API key to authenticate application clients and SDK
            requests against the GrowX Gateway.
          </p>
          <button
            type="button"
            className="btn-primary"
            onClick={() => setIsCreateOpen(true)}
          >
            Create API key
          </button>
        </div>
      ) : (
        <div className="table-responsive">
          <table className="overview-data-table api-keys-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Prefix</th>
                <th>Environment</th>
                <th>Scopes</th>
                <th>Created</th>
                <th>Last used</th>
                <th>Status</th>
                <th className="th-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredKeys.length === 0 ? (
                <tr>
                  <td colSpan={8} className="table-empty-row">
                    No keys match "{searchQuery}"
                  </td>
                </tr>
              ) : (
                filteredKeys.map((key) => {
                  const isActive = key.status === "active";
                  const isRevoked = key.status === "revoked";
                  const isExpired = key.status === "expired";

                  return (
                    <tr
                      key={key.id}
                      className={isRevoked ? "row-revoked" : undefined}
                    >
                      <td>
                        <Link
                          href={`${base}/${key.id}`}
                          className="key-name-link"
                          title="View API key details"
                        >
                          <strong>{key.name}</strong>
                        </Link>
                      </td>
                      <td>
                        <div className="prefix-cell">
                          <code className="key-prefix-code">{key.prefix}</code>
                          <button
                            type="button"
                            className="btn-copy-icon"
                            onClick={() => handleCopyPrefix(key.id, key.prefix)}
                            aria-label={`Copy prefix for ${key.name}`}
                          >
                            {copiedPrefixId === key.id ? "✓" : "❐"}
                          </button>
                        </div>
                      </td>
                      <td>
                        <span className={`env-tag env-${key.environment}`}>
                          {key.environment}
                        </span>
                      </td>
                      <td>
                        <div className="scopes-summary-wrap">
                          {key.permissions.slice(0, 2).map((scope) => (
                            <span key={scope} className="scope-tag">
                              {scope}
                            </span>
                          ))}
                          {key.permissions.length > 2 ? (
                            <span className="scope-more-tag">
                              +{key.permissions.length - 2}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="text-secondary text-sm">
                        {new Date(key.createdAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </td>
                      <td className="text-secondary text-sm">
                        {key.lastUsedAt
                          ? new Date(key.lastUsedAt).toLocaleDateString(
                              "en-US",
                              {
                                month: "short",
                                day: "numeric",
                              },
                            )
                          : "Never"}
                      </td>
                      <td>
                        {isActive ? (
                          <span className="status-pill status-healthy">
                            Active
                          </span>
                        ) : isRevoked ? (
                          <span className="status-pill status-danger">
                            Revoked
                          </span>
                        ) : isExpired ? (
                          <span className="status-pill status-warning">
                            Expired
                          </span>
                        ) : null}
                      </td>
                      <td className="td-actions">
                        {isActive ? (
                          <div className="row-actions-group">
                            <button
                              type="button"
                              className="btn-action-ghost"
                              onClick={() => handleRotateKey(key)}
                              title="Rotate key and generate new secret"
                            >
                              Rotate
                            </button>
                            <button
                              type="button"
                              className="btn-action-danger"
                              onClick={() => setKeyToRevoke(key)}
                              title="Revoke key immediately"
                            >
                              Revoke
                            </button>
                          </div>
                        ) : (
                          <span className="text-disabled text-xs">
                            Disabled
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Creation Modal */}
      <CreateApiKeyDialog
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onSubmit={handleCreateKey}
        isSubmitting={isSubmitting}
      />

      {/* Single-view Secret Reveal Modal */}
      <SecretRevealModal
        isOpen={Boolean(secretToReveal)}
        secret={secretToReveal}
        keyName={revealedKeyName}
        onClose={handleCloseSecretModal}
      />

      {/* Revocation Destructive Confirmation Modal */}
      <RevokeKeyDialog
        isOpen={Boolean(keyToRevoke)}
        apiKey={keyToRevoke}
        onClose={() => setKeyToRevoke(null)}
        onConfirm={handleRevokeConfirm}
        isRevoking={isRevoking}
      />
    </div>
  );
}
