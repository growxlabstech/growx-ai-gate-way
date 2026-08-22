"use client";

import { useState } from "react";
import Link from "next/link";
import type {
  BillingInvoiceItem,
  BillingProfileData,
  BillingTransactionItem,
  CreditTopupPackage,
  WorkspaceBillingSummary,
  WorkspaceSubscriptionDetails,
  WorkspaceWalletDetails,
} from "../../lib/billing-data";
import { CheckoutDialog } from "./checkout-dialog";

interface BillingOverviewViewProps {
  organizationSlug: string;
  workspaceSlug: string;
  initialSummary: WorkspaceBillingSummary;
}

export function BillingOverviewView({
  organizationSlug,
  workspaceSlug,
  initialSummary,
}: BillingOverviewViewProps) {
  const [summary, setSummary] =
    useState<WorkspaceBillingSummary>(initialSummary);
  const [activeTab, setActiveTab] = useState<
    "transactions" | "invoices" | "profile" | "plan"
  >("transactions");
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const wallet = summary.wallet;
  const subscription = summary.subscription;
  const transactions = summary.transactions;
  const invoices = summary.invoices;
  const profile = summary.billingProfile;

  function handlePaymentComplete(amountAdded: number) {
    const updatedAvailable = wallet.availableBalance + amountAdded;
    const updatedTotal = wallet.totalBalance + amountAdded;

    const newTx: BillingTransactionItem = {
      id: `tx_${Date.now()}`,
      sequence: `${parseInt(transactions[0]?.sequence ?? "5000", 10) + 1}`,
      timestamp: new Date().toISOString(),
      relativeTime: "Just now",
      type: "credit_purchase",
      description: `Prepaid Credit Top-up (${wallet.currencySymbol}${amountAdded.toFixed(2)})`,
      amount: amountAdded,
      amountFormatted: `+${wallet.currencySymbol}${amountAdded.toFixed(2)}`,
      direction: "credit",
      status: "completed",
      resultingBalanceFormatted: `${wallet.currencySymbol}${updatedAvailable.toFixed(2)}`,
      referenceType: "checkout_session",
    };

    const newInv: BillingInvoiceItem = {
      id: `inv_${Date.now()}`,
      invoiceNumber: `INV-2026-${String(invoices.length + 100).padStart(4, "0")}`,
      issueDate: new Date().toISOString(),
      dueDate: new Date().toISOString(),
      periodLabel: "Immediate Top-up",
      subtotal: amountAdded,
      subtotalFormatted: `${wallet.currencySymbol}${amountAdded.toFixed(2)}`,
      taxTotal: 0,
      taxTotalFormatted: `${wallet.currencySymbol}0.00`,
      taxLines: [],
      total: amountAdded,
      totalFormatted: `${wallet.currencySymbol}${amountAdded.toFixed(2)}`,
      amountPaidFormatted: `${wallet.currencySymbol}${amountAdded.toFixed(2)}`,
      currency: wallet.currency,
      status: "paid",
      pdfDownloadUrl: `/api/workspaces/${workspaceSlug}/billing/invoices/inv_${Date.now()}/pdf`,
    };

    setSummary({
      ...summary,
      wallet: {
        ...wallet,
        availableBalance: updatedAvailable,
        availableBalanceFormatted: `${wallet.currencySymbol}${updatedAvailable.toFixed(2)}`,
        totalBalance: updatedTotal,
        totalBalanceFormatted: `${wallet.currencySymbol}${updatedTotal.toFixed(2)}`,
      },
      transactions: [newTx, ...transactions],
      invoices: [newInv, ...invoices],
    });
  }

  async function handleDownloadInvoice(inv: BillingInvoiceItem) {
    setDownloadingId(inv.id);
    try {
      // Simulate real invoice download payload
      const response = await fetch(inv.pdfDownloadUrl);
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${inv.invoiceNumber}.pdf`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    } catch {}
    setTimeout(() => setDownloadingId(null), 1000);
  }

  return (
    <div
      className="billing-dashboard-container"
      data-testid="billing-overview-root"
    >
      {/* 1. Header Actions */}
      <div className="billing-header-bar">
        <div className="billing-header-left">
          <span className="billing-org-scope-badge">
            🏢 Organization Billing Scope ({organizationSlug})
          </span>
        </div>
        <div className="billing-header-right">
          <button
            type="button"
            className="btn-primary btn-add-credits"
            onClick={() => setCheckoutOpen(true)}
            id="add-credits-btn"
          >
            + Add Credits
          </button>
        </div>
      </div>

      {/* 2. Top Summary Metric Cards */}
      <div className="billing-metric-cards-grid">
        {/* Card 1: Available Balance */}
        <div className="billing-metric-card">
          <div className="metric-card-top-row">
            <span className="metric-card-label">Available Balance</span>
            <span className={`status-pill status-${wallet.status}`}>
              {wallet.status.toUpperCase()}
            </span>
          </div>
          <div className="metric-card-value-row">
            <span className="metric-card-number text-accent-success">
              {wallet.availableBalanceFormatted}
            </span>
            <span className="metric-currency-tag">{wallet.currency}</span>
          </div>
          <span className="metric-card-sub">
            {wallet.reservedBalance > 0
              ? `Reserved: ${wallet.reservedBalanceFormatted} (Batch/Streams) · Total: ${wallet.totalBalanceFormatted}`
              : "Prepaid consumable credit ledger"}
          </span>
        </div>

        {/* Card 2: Current Spend */}
        <div className="billing-metric-card">
          <div className="metric-card-top-row">
            <span className="metric-card-label">Current Period Spend</span>
            {wallet.autoTopupEnabled ? (
              <span className="badge-subtle" title="Auto-topup active">
                Auto-Topup ON
              </span>
            ) : null}
          </div>
          <div className="metric-card-value-row">
            <span className="metric-card-number">
              {wallet.currentSpendFormatted}
            </span>
            <span className="metric-currency-tag">{wallet.currency}</span>
          </div>
          <span className="metric-card-sub">
            {wallet.autoTopupEnabled
              ? `Auto-adds $${wallet.autoTopupAmount} when balance drops below $${wallet.autoTopupThreshold}`
              : "Manual top-up mode active"}
          </span>
        </div>

        {/* Card 3: Subscription / Plan */}
        <div className="billing-metric-card">
          <div className="metric-card-top-row">
            <span className="metric-card-label">Commercial Plan</span>
            <span className="badge-success">{subscription.planName}</span>
          </div>
          <div className="metric-card-value-row">
            <span
              className="metric-card-number font-sans"
              style={{ fontSize: "18px" }}
            >
              {subscription.planName}
            </span>
          </div>
          <span className="metric-card-sub">
            Limit: {subscription.rateLimits.rpm} RPM ·{" "}
            {subscription.rateLimits.maxConcurrency} Concurrency
          </span>
        </div>
      </div>

      {/* 3. Tabbed Details: Transactions / Invoices / Profile / Plan */}
      <div className="billing-breakdown-section">
        <div className="breakdown-tabs-header" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "transactions"}
            className={`breakdown-tab-btn ${activeTab === "transactions" ? "is-active" : ""}`}
            onClick={() => setActiveTab("transactions")}
          >
            Transactions ({transactions.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "invoices"}
            className={`breakdown-tab-btn ${activeTab === "invoices" ? "is-active" : ""}`}
            onClick={() => setActiveTab("invoices")}
          >
            Invoices ({invoices.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "profile"}
            className={`breakdown-tab-btn ${activeTab === "profile" ? "is-active" : ""}`}
            onClick={() => setActiveTab("profile")}
          >
            Billing Profile & Tax
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "plan"}
            className={`breakdown-tab-btn ${activeTab === "plan" ? "is-active" : ""}`}
            onClick={() => setActiveTab("plan")}
          >
            Plan & Entitlements
          </button>
        </div>

        {/* Tab 1: Transactions Table */}
        {activeTab === "transactions" ? (
          <div className="billing-tab-pane">
            {transactions.length === 0 ? (
              <div className="billing-empty-box">
                <p>No financial transactions recorded yet.</p>
              </div>
            ) : (
              <div className="table-responsive-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Date / Time</th>
                      <th>Type</th>
                      <th>Description</th>
                      <th className="num-col">Amount</th>
                      <th className="num-col">Balance Impact</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((tx) => (
                      <tr key={tx.id}>
                        <td
                          className="timestamp-cell"
                          title={new Date(tx.timestamp).toISOString()}
                        >
                          <span className="relative-time">
                            {tx.relativeTime}
                          </span>
                        </td>
                        <td>
                          <span
                            className={`badge-subtle font-mono ${
                              tx.type === "credit_purchase"
                                ? "badge-success"
                                : ""
                            }`}
                          >
                            {tx.type.replace("_", " ").toUpperCase()}
                          </span>
                        </td>
                        <td>
                          <span className="tx-desc-text">{tx.description}</span>
                        </td>
                        <td
                          className={`num-col font-mono font-bold ${
                            tx.direction === "credit"
                              ? "text-accent-success"
                              : "text-text-primary"
                          }`}
                        >
                          {tx.amountFormatted}
                        </td>
                        <td className="num-col font-mono muted-cell">
                          {tx.resultingBalanceFormatted}
                        </td>
                        <td>
                          <span className="status-pill status-succeeded">
                            {tx.status.toUpperCase()}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : null}

        {/* Tab 2: Invoices Table */}
        {activeTab === "invoices" ? (
          <div className="billing-tab-pane">
            {invoices.length === 0 ? (
              <div className="billing-empty-box">
                <p>No invoices generated yet.</p>
              </div>
            ) : (
              <div className="table-responsive-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Invoice #</th>
                      <th>Issue Date</th>
                      <th>Period</th>
                      <th className="num-col">Subtotal</th>
                      <th className="num-col">Total</th>
                      <th>Status</th>
                      <th>Document</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((inv) => (
                      <tr key={inv.id}>
                        <td>
                          <strong className="font-mono">
                            {inv.invoiceNumber}
                          </strong>
                        </td>
                        <td className="timestamp-cell">
                          {new Date(inv.issueDate).toLocaleDateString()}
                        </td>
                        <td className="muted-cell">{inv.periodLabel}</td>
                        <td className="num-col font-mono">
                          {inv.subtotalFormatted}
                        </td>
                        <td className="num-col font-mono font-bold text-accent-success">
                          {inv.totalFormatted}
                        </td>
                        <td>
                          <span className="status-pill status-succeeded">
                            {inv.status.toUpperCase()}
                          </span>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn-secondary btn-sm"
                            onClick={() => handleDownloadInvoice(inv)}
                            disabled={downloadingId === inv.id}
                          >
                            {downloadingId === inv.id
                              ? "Downloading…"
                              : "Download PDF ↓"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : null}

        {/* Tab 3: Billing Profile & Tax */}
        {activeTab === "profile" ? (
          <div className="billing-tab-pane">
            <div className="profile-details-card">
              <h3 className="section-title">Legal Entity & Tax Registration</h3>
              <dl className="metadata-dl">
                <div className="dl-row">
                  <dt>Legal Business Name</dt>
                  <dd>
                    <strong>{profile.legalName}</strong>
                  </dd>
                </div>
                <div className="dl-row">
                  <dt>Billing Email</dt>
                  <dd>
                    <code>{profile.billingEmail}</code>
                  </dd>
                </div>
                <div className="dl-row">
                  <dt>Tax Registration / Identification</dt>
                  <dd>
                    {profile.taxId ? (
                      <code>
                        {profile.taxType ?? "TAX ID"}: {profile.taxId}
                      </code>
                    ) : (
                      <span className="muted-cell">Not configured</span>
                    )}
                  </dd>
                </div>
                <div className="dl-row">
                  <dt>Billing Address</dt>
                  <dd>
                    {profile.addressLine1}, {profile.city},{" "}
                    {profile.state ? `${profile.state} ` : ""}
                    {profile.postalCode}, {profile.country}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        ) : null}

        {/* Tab 4: Plan & Entitlements */}
        {activeTab === "plan" ? (
          <div className="billing-tab-pane">
            <div className="plan-entitlements-card">
              <div className="plan-header-strip">
                <div>
                  <h3 className="plan-title">{subscription.planName}</h3>
                  <p className="plan-subtitle">
                    Commercial tier {subscription.planVersion} ·{" "}
                    {subscription.billingInterval.toUpperCase()} billing
                  </p>
                </div>
                <span className="badge-success">ACTIVE PLAN</span>
              </div>

              <h4 className="entitlements-subheading">
                Authoritative Phase-18 Entitlements
              </h4>
              <div className="entitlement-pills-grid">
                <div className="entitlement-pill-box">
                  <span className="entitlement-lbl">Rate Limit (RPM)</span>
                  <span className="entitlement-val">
                    {subscription.rateLimits.rpm.toLocaleString()} RPM
                  </span>
                </div>
                <div className="entitlement-pill-box">
                  <span className="entitlement-lbl">
                    Token Throughput (TPM)
                  </span>
                  <span className="entitlement-val">
                    {subscription.rateLimits.tpm.toLocaleString()} TPM
                  </span>
                </div>
                <div className="entitlement-pill-box">
                  <span className="entitlement-lbl">Max Concurrency</span>
                  <span className="entitlement-val">
                    {subscription.rateLimits.maxConcurrency} parallel requests
                  </span>
                </div>
              </div>

              <h4
                className="entitlements-subheading"
                style={{ marginTop: "20px" }}
              >
                Included Capabilities
              </h4>
              <ul className="plan-features-list">
                {subscription.features.map((feat, idx) => (
                  <li key={idx} className="plan-feature-item">
                    <span className="feature-check">✓</span>
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}
      </div>

      {/* 4. Checkout Dialog */}
      <CheckoutDialog
        organizationSlug={organizationSlug}
        workspaceSlug={workspaceSlug}
        packages={summary.topupPackages}
        currencySymbol={wallet.currencySymbol}
        currency={wallet.currency}
        isOpen={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        onPaymentComplete={handlePaymentComplete}
      />
    </div>
  );
}
