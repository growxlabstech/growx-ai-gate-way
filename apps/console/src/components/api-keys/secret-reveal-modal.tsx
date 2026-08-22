"use client";

import { useEffect, useRef, useState } from "react";

interface SecretRevealModalProps {
  isOpen: boolean;
  secret: string | null;
  keyName: string;
  onClose: () => void;
}

export function SecretRevealModal({
  isOpen,
  secret,
  keyName,
  onClose,
}: SecretRevealModalProps) {
  const [copied, setCopied] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const copyButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen) {
      setCopied(false);
      setRevealed(false);
      setTimeout(() => {
        copyButtonRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !secret) return null;

  async function handleCopy() {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      // Fallback if clipboard API is restricted
      setCopied(true);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <div
        className="modal-dialog secret-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="secret-dialog-title"
      >
        <div className="modal-header">
          <div>
            <h2 id="secret-dialog-title" className="modal-title">
              Save your API key
            </h2>
            <p className="modal-subtitle">
              Created key for: <strong>{keyName}</strong>
            </p>
          </div>
        </div>

        <div className="modal-body">
          <div className="alert-warning" role="alert">
            <span className="alert-icon" aria-hidden="true">
              ⚠
            </span>
            <div>
              <strong>Copy this key now.</strong> You won't be able to view it
              again. GrowX does not store raw secrets.
            </div>
          </div>

          <div className="secret-display-box">
            <input
              type={revealed ? "text" : "password"}
              readOnly
              value={secret}
              className="secret-input"
              aria-label="Generated API Key Secret"
              onFocus={(e) => e.target.select()}
            />
            <div className="secret-actions">
              <button
                type="button"
                className="btn-ghost btn-sm"
                onClick={() => setRevealed(!revealed)}
                aria-label={revealed ? "Hide secret" : "Reveal secret"}
              >
                {revealed ? "Hide" : "Reveal"}
              </button>
              <button
                ref={copyButtonRef}
                type="button"
                className="btn-primary btn-sm"
                onClick={handleCopy}
                aria-live="polite"
              >
                {copied ? "Copied ✓" : "Copy key"}
              </button>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button
            ref={closeButtonRef}
            type="button"
            className="btn-secondary"
            onClick={onClose}
          >
            I have saved this key
          </button>
        </div>
      </div>
    </div>
  );
}
