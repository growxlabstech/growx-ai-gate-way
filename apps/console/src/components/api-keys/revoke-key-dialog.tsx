"use client";

import { useEffect } from "react";
import type { ConsoleApiKey } from "../../lib/api-keys-data";

interface RevokeKeyDialogProps {
  isOpen: boolean;
  apiKey: ConsoleApiKey | null;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  isRevoking: boolean;
}

export function RevokeKeyDialog({
  isOpen,
  apiKey,
  onClose,
  onConfirm,
  isRevoking,
}: RevokeKeyDialogProps) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen && !isRevoking) {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isRevoking, onClose]);

  if (!isOpen || !apiKey) return null;

  return (
    <div className="modal-backdrop" role="presentation">
      <div
        className="modal-dialog revoke-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="revoke-dialog-title"
      >
        <div className="modal-header">
          <div>
            <h2 id="revoke-dialog-title" className="modal-title">
              Revoke API key
            </h2>
            <p className="modal-subtitle">
              Permanently disable <strong>{apiKey.name}</strong>
            </p>
          </div>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label="Close dialog"
            disabled={isRevoking}
          >
            ✕
          </button>
        </div>

        <div className="modal-body">
          <div className="alert-danger" role="alert">
            <span className="alert-icon" aria-hidden="true">
              ⚠
            </span>
            <div>
              <strong>Immediate access termination:</strong> Applications or SDK
              clients using key <code>{apiKey.prefix}</code> will immediately
              fail authentication with code <code>revoked_api_key</code>.
            </div>
          </div>
          <p className="revoke-confirmation-text">
            This action is irreversible and recorded in the tenant audit log.
          </p>
        </div>

        <div className="modal-footer">
          <button
            type="button"
            className="btn-secondary"
            onClick={onClose}
            disabled={isRevoking}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn-danger"
            onClick={onConfirm}
            disabled={isRevoking}
          >
            {isRevoking ? "Revoking key…" : "Revoke API key"}
          </button>
        </div>
      </div>
    </div>
  );
}
