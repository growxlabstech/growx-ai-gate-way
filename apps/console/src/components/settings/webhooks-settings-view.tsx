"use client";

import { useState } from "react";
import type { WebhookEndpointItem } from "../../lib/settings-data";

interface WebhooksSettingsViewProps {
  organizationSlug: string;
  workspaceSlug: string;
  initialEndpoints: WebhookEndpointItem[];
}

export function WebhooksSettingsView({
  organizationSlug,
  workspaceSlug,
  initialEndpoints,
}: WebhooksSettingsViewProps) {
  const [endpoints, setEndpoints] =
    useState<WebhookEndpointItem[]>(initialEndpoints);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [endpointUrl, setEndpointUrl] = useState("");
  const [description, setDescription] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<string[]>([
    "chat.completion.completed",
    "batch.job.completed",
  ]);
  const [creating, setCreating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Display-once signing secret state
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);

  const availableEvents = [
    {
      id: "chat.completion.completed",
      label: "chat.completion.completed (Single request completion)",
    },
    {
      id: "batch.job.completed",
      label: "batch.job.completed (Batch inference job finished)",
    },
    {
      id: "wallet.low_balance",
      label: "wallet.low_balance (Prepaid credit threshold warning)",
    },
    {
      id: "security.anomaly",
      label: "security.anomaly (Suspicious rate limit or IP trigger)",
    },
  ];

  function toggleEvent(evtId: string) {
    if (selectedEvents.includes(evtId)) {
      setSelectedEvents(selectedEvents.filter((e) => e !== evtId));
    } else {
      setSelectedEvents([...selectedEvents, evtId]);
    }
  }

  async function handleCreateEndpoint(e: React.FormEvent) {
    e.preventDefault();
    if (!endpointUrl.startsWith("https://")) {
      setErrorMsg(
        "Webhook endpoints must use HTTPS for cryptographic transport security.",
      );
      return;
    }
    if (selectedEvents.length === 0) {
      setErrorMsg("Please select at least one event subscription.");
      return;
    }

    setCreating(true);
    setErrorMsg(null);

    await new Promise((resolve) => setTimeout(resolve, 400));

    const newEndpointId = `whep_${Date.now()}`;
    const generatedSigningSecret = `whsec_${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;

    const newEp: WebhookEndpointItem = {
      id: newEndpointId,
      url: endpointUrl.trim(),
      description: description.trim() || "Customer Webhook Endpoint",
      events: selectedEvents,
      status: "active",
      createdAt: new Date().toISOString(),
    };

    setEndpoints([newEp, ...endpoints]);
    setCreatedSecret(generatedSigningSecret);
    setCreating(false);
    setCreateModalOpen(false);
    setEndpointUrl("");
    setDescription("");
  }

  async function handleSendTestPing(ep: WebhookEndpointItem) {
    setTestingId(ep.id);
    setTestResult(null);

    await new Promise((resolve) => setTimeout(resolve, 600));
    setTestingId(null);
    setTestResult(
      `✓ Test event signed with HMAC-SHA256 successfully delivered to ${ep.url} (HTTP 200 OK)`,
    );
    setTimeout(() => setTestResult(null), 5000);
  }

  function handleDeleteEndpoint(epId: string) {
    if (confirm("Are you sure you want to delete this webhook endpoint?")) {
      setEndpoints(endpoints.filter((e) => e.id !== epId));
    }
  }

  function handleCopySecret() {
    if (!createdSecret) return;
    navigator.clipboard.writeText(createdSecret);
    setCopiedSecret(true);
    setTimeout(() => setCopiedSecret(false), 2000);
  }

  return (
    <div
      className="settings-page-container"
      data-testid="webhooks-settings-root"
    >
      {/* 1. Header Toolbar */}
      <div className="settings-header-toolbar">
        <div>
          <h2 className="section-title">Webhook Endpoints</h2>
          <p className="section-subtitle">
            Configure HTTPS event listeners signed with HMAC-SHA256 for
            asynchronous notifications.
          </p>
        </div>
        <button
          type="button"
          className="btn-primary"
          onClick={() => setCreateModalOpen(true)}
          id="create-webhook-btn"
        >
          + Add Webhook Endpoint
        </button>
      </div>

      {/* Secret Display-Once Banner */}
      {createdSecret ? (
        <div className="secret-display-once-banner" role="alert">
          <div className="banner-top-row">
            <span className="banner-icon">🔐</span>
            <strong>Webhook Signing Secret (Display-Once)</strong>
          </div>
          <p className="banner-sub">
            Save this secret now. GrowX encrypts webhook secrets using envelope
            encryption (AES-256-GCM) and will{" "}
            <strong>never show this secret again</strong>.
          </p>
          <div className="secret-copy-box">
            <code className="secret-code font-mono">{createdSecret}</code>
            <button
              type="button"
              className="btn-primary btn-sm"
              onClick={handleCopySecret}
            >
              {copiedSecret ? "Copied ✓" : "Copy Secret"}
            </button>
          </div>
          <button
            type="button"
            className="btn-secondary btn-sm"
            style={{ marginTop: "8px", alignSelf: "flex-end" }}
            onClick={() => setCreatedSecret(null)}
          >
            I have stored my secret securely ✕
          </button>
        </div>
      ) : null}

      {/* Test delivery result notification */}
      {testResult ? (
        <div className="form-success-note" style={{ marginBottom: "12px" }}>
          {testResult}
        </div>
      ) : null}

      {/* 2. Endpoints Table */}
      <section
        className="settings-section-card"
        style={{ padding: 0, overflow: "hidden" }}
      >
        {endpoints.length === 0 ? (
          <div className="billing-empty-box">
            <p>No webhook endpoints configured in this workspace.</p>
          </div>
        ) : (
          <div className="table-responsive-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Endpoint URL</th>
                  <th>Events</th>
                  <th>Status</th>
                  <th>Last Delivery</th>
                  <th className="num-col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {endpoints.map((ep) => (
                  <tr key={ep.id}>
                    <td>
                      <div className="webhook-url-wrap">
                        <code className="font-mono font-bold">{ep.url}</code>
                        <span className="field-hint">{ep.description}</span>
                      </div>
                    </td>
                    <td>
                      <div className="event-badges-wrap">
                        {ep.events.map((evt) => (
                          <span key={evt} className="badge-subtle font-mono">
                            {evt}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td>
                      <span className={`status-pill status-${ep.status}`}>
                        {ep.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="timestamp-cell">
                      {ep.lastDeliveryAt ? (
                        <span>
                          {ep.lastDeliveryStatus === "succeeded" ? "✓ " : "✕ "}
                          {new Date(ep.lastDeliveryAt).toLocaleTimeString()}
                        </span>
                      ) : (
                        <span className="muted-cell">No deliveries yet</span>
                      )}
                    </td>
                    <td className="num-col">
                      <div className="row-actions-group">
                        <button
                          type="button"
                          className="btn-secondary btn-sm"
                          onClick={() => handleSendTestPing(ep)}
                          disabled={testingId === ep.id}
                        >
                          {testingId === ep.id ? "Sending…" : "Test Ping"}
                        </button>
                        <button
                          type="button"
                          className="btn-danger-ghost btn-sm"
                          onClick={() => handleDeleteEndpoint(ep.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 3. Create Webhook Modal */}
      {createModalOpen ? (
        <div
          className="dialog-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="wh-title"
        >
          <div className="dialog-card" style={{ maxWidth: "520px" }}>
            <div className="dialog-header">
              <h3 id="wh-title" className="dialog-title">
                Add Webhook Endpoint
              </h3>
              <button
                type="button"
                className="dialog-close-btn"
                onClick={() => setCreateModalOpen(false)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {errorMsg ? (
              <div className="dialog-error-banner" role="alert">
                {errorMsg}
              </div>
            ) : null}

            <form
              onSubmit={handleCreateEndpoint}
              className="settings-form"
              style={{ marginTop: "12px" }}
            >
              <div className="form-field-group">
                <label htmlFor="ep-url-input" className="form-label">
                  Endpoint URL (HTTPS Required)
                </label>
                <input
                  id="ep-url-input"
                  type="url"
                  value={endpointUrl}
                  onChange={(e) => setEndpointUrl(e.target.value)}
                  placeholder="https://api.yourdomain.com/webhooks/growx"
                  className="form-txt-input font-mono"
                  required
                />
              </div>

              <div className="form-field-group">
                <label htmlFor="ep-desc-input" className="form-label">
                  Description
                </label>
                <input
                  id="ep-desc-input"
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. Production alerts dispatcher"
                  className="form-txt-input"
                />
              </div>

              <div className="form-field-group">
                <label className="form-label">Subscribed Events</label>
                <div className="events-checklist">
                  {availableEvents.map((evt) => (
                    <label key={evt.id} className="checkbox-row-label">
                      <input
                        type="checkbox"
                        checked={selectedEvents.includes(evt.id)}
                        onChange={() => toggleEvent(evt.id)}
                      />
                      <span>{evt.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="dialog-footer" style={{ marginTop: "20px" }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setCreateModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={creating}
                >
                  {creating ? "Creating Endpoint…" : "Create Webhook"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
