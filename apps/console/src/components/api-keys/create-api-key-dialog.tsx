"use client";

import { useEffect, useRef, useState } from "react";
import {
  CANONICAL_API_KEY_SCOPES,
  DEFAULT_API_KEY_SCOPES,
  type ApiKeyEnvironment,
  type ApiKeyScope,
  type CreateApiKeyInput,
} from "../../lib/api-keys-data";

interface CreateApiKeyDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (input: CreateApiKeyInput) => Promise<void>;
  isSubmitting: boolean;
}

export function CreateApiKeyDialog({
  isOpen,
  onClose,
  onSubmit,
  isSubmitting,
}: CreateApiKeyDialogProps) {
  const [name, setName] = useState("");
  const [environment, setEnvironment] =
    useState<ApiKeyEnvironment>("production");
  const [expiresInDays, setExpiresInDays] = useState<number | null>(null);
  const [selectedScopes, setSelectedScopes] = useState<Set<ApiKeyScope>>(
    new Set(DEFAULT_API_KEY_SCOPES),
  );
  const [error, setError] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setName("");
      setEnvironment("production");
      setExpiresInDays(null);
      setSelectedScopes(new Set(DEFAULT_API_KEY_SCOPES));
      setError(null);
      setTimeout(() => {
        nameInputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen && !isSubmitting) {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen) return null;

  function toggleScope(scope: ApiKeyScope) {
    setSelectedScopes((prev) => {
      const next = new Set(prev);
      if (next.has(scope)) {
        next.delete(scope);
      } else {
        next.add(scope);
      }
      return next;
    });
  }

  function handleSelectAll() {
    if (selectedScopes.size === CANONICAL_API_KEY_SCOPES.length) {
      setSelectedScopes(new Set(DEFAULT_API_KEY_SCOPES));
    } else {
      setSelectedScopes(new Set(CANONICAL_API_KEY_SCOPES.map((s) => s.id)));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Please provide a name for this API key.");
      nameInputRef.current?.focus();
      return;
    }
    if (selectedScopes.size === 0) {
      setError("Please select at least one permission scope.");
      return;
    }

    setError(null);
    try {
      await onSubmit({
        name: name.trim(),
        environment,
        permissions: Array.from(selectedScopes),
        expiresInDays,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create API key");
    }
  }

  const groups = Array.from(
    new Set(CANONICAL_API_KEY_SCOPES.map((s) => s.group)),
  );

  return (
    <div className="modal-backdrop" role="presentation">
      <div
        className="modal-dialog create-key-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-key-title"
      >
        <div className="modal-header">
          <div>
            <h2 id="create-key-title" className="modal-title">
              Create API key
            </h2>
            <p className="modal-subtitle">
              Generate a scoped credential for machine authentication against
              the GrowX Gateway.
            </p>
          </div>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label="Close dialog"
            disabled={isSubmitting}
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body form-stack">
            {error ? (
              <div className="alert-danger" role="alert">
                <span>⚠</span>
                <div>{error}</div>
              </div>
            ) : null}

            <div className="form-group">
              <label htmlFor="key-name-input" className="form-label required">
                Key name
              </label>
              <input
                id="key-name-input"
                ref={nameInputRef}
                type="text"
                className="form-input"
                placeholder="e.g. Production Backend, Next.js Server, CI Runner"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
                required
                disabled={isSubmitting}
              />
              <span className="form-hint">
                A human-readable label to identify where this credential is
                used.
              </span>
            </div>

            <div className="form-row-two-col">
              <div className="form-group">
                <label htmlFor="key-env-select" className="form-label">
                  Environment
                </label>
                <select
                  id="key-env-select"
                  className="form-select"
                  value={environment}
                  onChange={(e) =>
                    setEnvironment(e.target.value as ApiKeyEnvironment)
                  }
                  disabled={isSubmitting}
                >
                  <option value="production">Production (gx_live_...)</option>
                  <option value="staging">Staging (gx_test_...)</option>
                  <option value="development">Development (gx_test_...)</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="key-expiry-select" className="form-label">
                  Expiration
                </label>
                <select
                  id="key-expiry-select"
                  className="form-select"
                  value={
                    expiresInDays === null ? "never" : String(expiresInDays)
                  }
                  onChange={(e) =>
                    setExpiresInDays(
                      e.target.value === "never"
                        ? null
                        : Number(e.target.value),
                    )
                  }
                  disabled={isSubmitting}
                >
                  <option value="never">Never expires</option>
                  <option value="30">30 days</option>
                  <option value="60">60 days</option>
                  <option value="90">90 days</option>
                </select>
              </div>
            </div>

            <div className="scopes-section">
              <div className="scopes-header">
                <div>
                  <label className="form-label">Permission scopes</label>
                  <span className="form-hint">
                    Restrict operations executable with this credential.
                  </span>
                </div>
                <button
                  type="button"
                  className="btn-ghost btn-xs"
                  onClick={handleSelectAll}
                  disabled={isSubmitting}
                >
                  {selectedScopes.size === CANONICAL_API_KEY_SCOPES.length
                    ? "Reset to default"
                    : "Select all"}
                </button>
              </div>

              <div className="scopes-group-list">
                {groups.map((group) => {
                  const items = CANONICAL_API_KEY_SCOPES.filter(
                    (s) => s.group === group,
                  );
                  return (
                    <div key={group} className="scopes-group">
                      <div className="scopes-group-title">{group}</div>
                      <div className="scopes-checkbox-grid">
                        {items.map((scope) => {
                          const isChecked = selectedScopes.has(scope.id);
                          return (
                            <label
                              key={scope.id}
                              className={`scope-checkbox-label ${isChecked ? "is-selected" : ""}`}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => toggleScope(scope.id)}
                                disabled={isSubmitting}
                              />
                              <div className="scope-text-wrap">
                                <code className="scope-name">
                                  {scope.label}
                                </code>
                                <span className="scope-desc">
                                  {scope.description}
                                </span>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="modal-footer">
            <button
              type="button"
              className="btn-secondary"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={isSubmitting || !name.trim()}
            >
              {isSubmitting ? "Creating key…" : "Create API key"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
