"use client";

import { useEffect, useState } from "react";
import type {
  AvailablePaymentMethod,
  CheckoutSessionDetails,
  CreditTopupPackage,
  PaymentMethodType,
} from "../../lib/billing-data";

interface CheckoutDialogProps {
  organizationSlug: string;
  workspaceSlug: string;
  packages: CreditTopupPackage[];
  currencySymbol: string;
  currency: string;
  isOpen: boolean;
  onClose: () => void;
  onPaymentComplete: (amountAdded: number) => void;
}

export function CheckoutDialog({
  organizationSlug,
  workspaceSlug,
  packages,
  currencySymbol,
  currency,
  isOpen,
  onClose,
  onPaymentComplete,
}: CheckoutDialogProps) {
  const [selectedPkgId, setSelectedPkgId] = useState<string>("pkg_250");
  const [customAmount, setCustomAmount] = useState<string>("");
  const [isCustom, setIsCustom] = useState(false);
  const [step, setStep] = useState<
    "select_amount" | "checkout" | "processing" | "succeeded" | "failed"
  >("select_amount");
  const [session, setSession] = useState<CheckoutSessionDetails | null>(null);
  const [selectedMethod, setSelectedMethod] =
    useState<PaymentMethodType>("upi");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number>(900); // 15 mins expiry
  const [copiedVpa, setCopiedVpa] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setStep("select_amount");
      setSession(null);
      setErrorMsg(null);
      setLoading(false);
      return;
    }
  }, [isOpen]);

  // Countdown timer for active checkout session
  useEffect(() => {
    if (step !== "checkout" || !session) return;
    const interval = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setStep("failed");
          setErrorMsg("Payment session expired. Please start a new checkout.");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [step, session]);

  if (!isOpen) return null;

  async function handleCreateCheckout() {
    setLoading(true);
    setErrorMsg(null);

    let amountToBuy = 250;
    if (isCustom) {
      const parsed = parseFloat(customAmount);
      if (isNaN(parsed) || parsed < 10 || parsed > 10000) {
        setErrorMsg("Please enter a valid amount between $10 and $10,000");
        setLoading(false);
        return;
      }
      amountToBuy = parsed;
    } else {
      const found = packages.find((p) => p.id === selectedPkgId);
      if (found) amountToBuy = found.amount;
    }

    try {
      const res = await fetch(
        `/api/workspaces/${workspaceSlug}/billing/checkout`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            amount: amountToBuy,
            currency,
            packageId: isCustom ? undefined : selectedPkgId,
          }),
        },
      );

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to create checkout session");
      }

      const checkoutData: CheckoutSessionDetails = await res.json();
      setSession(checkoutData);
      setSelectedMethod(checkoutData.availableMethods[0]?.id ?? "upi");
      setSecondsLeft(900);
      setStep("checkout");
    } catch (e: any) {
      setErrorMsg(e.message || "Network error while initializing checkout");
    } finally {
      setLoading(false);
    }
  }

  async function handleSimulatePayment() {
    if (!session) return;
    setStep("processing");
    setLoading(true);
    setErrorMsg(null);

    try {
      // Client calls verification endpoint — Server verifies payment with payment engine
      const res = await fetch(
        `/api/workspaces/${workspaceSlug}/billing/checkout/${session.checkoutSessionId}/status`,
        {
          headers: { "content-type": "application/json" },
        },
      );

      if (!res.ok) {
        throw new Error("Payment verification failed on server");
      }

      const result = await res.json();
      if (result.status === "succeeded") {
        setStep("succeeded");
        onPaymentComplete(session.totalAmount);
      } else {
        setStep("failed");
        setErrorMsg(result.message || "Payment could not be completed");
      }
    } catch (e: any) {
      setStep("failed");
      setErrorMsg(e.message || "Payment verification encountered an error");
    } finally {
      setLoading(false);
    }
  }

  function handleCopyVpa(vpaText: string) {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(vpaText).catch(() => {});
    }
    setCopiedVpa(true);
    setTimeout(() => setCopiedVpa(false), 2000);
  }

  const mins = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;
  const timeFormatted = `${mins}:${secs < 10 ? "0" : ""}${secs}`;

  return (
    <div
      className="dialog-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="checkout-title"
    >
      <div className="dialog-card checkout-modal-card">
        {/* Header */}
        <div className="dialog-header">
          <div>
            <h2 id="checkout-title" className="dialog-title">
              {step === "select_amount" && "Add Credits to Workspace Wallet"}
              {step === "checkout" && "GrowX Secure Checkout"}
              {step === "processing" && "Verifying Payment…"}
              {step === "succeeded" && "Credits Successfully Activated"}
              {step === "failed" && "Checkout Incomplete"}
            </h2>
            <p className="dialog-subtitle">
              {step === "select_amount" &&
                "Select a credit package or specify a custom top-up amount."}
              {step === "checkout" &&
                `Order #${session?.orderId} · Authoritative server settlement.`}
              {step === "processing" &&
                "Awaiting confirmation from upstream payment rails…"}
              {step === "succeeded" &&
                "Your workspace balance has been updated immediately."}
              {step === "failed" && "The payment was not completed or expired."}
            </p>
          </div>
          <button
            type="button"
            className="dialog-close-btn"
            onClick={onClose}
            aria-label="Close dialog"
          >
            ✕
          </button>
        </div>

        {/* Error Alert */}
        {errorMsg ? (
          <div className="dialog-error-banner" role="alert">
            <span className="error-icon">⚠️</span>
            <span>{errorMsg}</span>
          </div>
        ) : null}

        {/* Step 1: Select Amount */}
        {step === "select_amount" ? (
          <div className="checkout-step-body">
            <div
              className="package-grid"
              role="radiogroup"
              aria-label="Credit Packages"
            >
              {packages.map((pkg) => (
                <button
                  type="button"
                  key={pkg.id}
                  role="radio"
                  aria-checked={!isCustom && selectedPkgId === pkg.id}
                  className={`package-card ${!isCustom && selectedPkgId === pkg.id ? "is-selected" : ""} ${
                    pkg.popular ? "is-popular" : ""
                  }`}
                  onClick={() => {
                    setIsCustom(false);
                    setSelectedPkgId(pkg.id);
                  }}
                >
                  {pkg.popular ? (
                    <span className="package-popular-badge">Most Popular</span>
                  ) : null}
                  <div className="package-amount-row">
                    <span className="package-amount">
                      {currencySymbol}
                      {pkg.amount}
                    </span>
                    {pkg.bonusAmountFormatted ? (
                      <span className="package-bonus-tag">
                        {pkg.bonusAmountFormatted}
                      </span>
                    ) : null}
                  </div>
                  <span className="package-unit-sub">
                    {pkg.currency} Credits
                  </span>
                </button>
              ))}
            </div>

            {/* Custom Amount Field */}
            <div className="custom-amount-wrap">
              <label className="custom-amount-label">
                <input
                  type="radio"
                  name="amount_choice"
                  checked={isCustom}
                  onChange={() => setIsCustom(true)}
                />
                <span>Or enter custom amount:</span>
              </label>
              <div className="custom-amount-input-row">
                <span className="currency-prefix">{currencySymbol}</span>
                <input
                  type="number"
                  min="10"
                  max="10000"
                  placeholder="e.g. 150"
                  value={customAmount}
                  disabled={!isCustom}
                  onChange={(e) => {
                    setIsCustom(true);
                    setCustomAmount(e.target.value);
                  }}
                  className="custom-amount-input"
                  aria-label="Custom credit amount"
                />
              </div>
            </div>

            {/* Footer Actions */}
            <div className="dialog-footer">
              <button type="button" className="btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={handleCreateCheckout}
                disabled={loading}
              >
                {loading ? "Creating Order…" : "Continue to Checkout →"}
              </button>
            </div>
          </div>
        ) : null}

        {/* Step 2: Checkout & Payment Methods */}
        {step === "checkout" && session ? (
          <div className="checkout-step-body">
            {/* Order Summary Strip */}
            <div className="order-summary-box">
              <div className="order-summary-left">
                <span className="order-summary-lbl">Order Total</span>
                <span className="order-summary-val">
                  {session.totalAmountFormatted}
                </span>
                <span className="order-summary-sub">{session.purpose}</span>
              </div>
              <div className="order-summary-right">
                <span
                  className="session-timer-badge"
                  title="Session expiry countdown"
                >
                  Expires in{" "}
                  <strong className="font-mono">{timeFormatted}</strong>
                </span>
              </div>
            </div>

            {/* Payment Method Selector */}
            <div className="method-selector-section">
              <h4 className="method-section-title">Select Payment Method</h4>
              <div
                className="methods-radio-group"
                role="radiogroup"
                aria-label="Payment Methods"
              >
                {session.availableMethods.map((m) => (
                  <button
                    type="button"
                    key={m.id}
                    role="radio"
                    aria-checked={selectedMethod === m.id}
                    className={`method-option-card ${selectedMethod === m.id ? "is-selected" : ""}`}
                    onClick={() => setSelectedMethod(m.id)}
                  >
                    <span className="method-icon">{m.icon}</span>
                    <div className="method-text">
                      <span className="method-name">{m.name}</span>
                      <span className="method-desc">{m.description}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Method Details Pane */}
            <div className="method-details-pane">
              {/* Case A: UPI / Dynamic QR */}
              {selectedMethod === "upi" ? (
                <div className="upi-pane-content">
                  <div className="qr-container">
                    <div
                      className="qr-box-simulated"
                      aria-label="Dynamic UPI QR Code"
                    >
                      {/* Clean SVG QR Pattern Representation */}
                      <svg
                        viewBox="0 0 160 160"
                        className="qr-svg-graphic"
                        aria-hidden="true"
                      >
                        <rect width="160" height="160" fill="#ffffff" rx="8" />
                        {/* QR Position Squares */}
                        <rect
                          x="16"
                          y="16"
                          width="36"
                          height="36"
                          fill="#090b10"
                        />
                        <rect
                          x="22"
                          y="22"
                          width="24"
                          height="24"
                          fill="#ffffff"
                        />
                        <rect
                          x="28"
                          y="28"
                          width="12"
                          height="12"
                          fill="#090b10"
                        />

                        <rect
                          x="108"
                          y="16"
                          width="36"
                          height="36"
                          fill="#090b10"
                        />
                        <rect
                          x="114"
                          y="22"
                          width="24"
                          height="24"
                          fill="#ffffff"
                        />
                        <rect
                          x="120"
                          y="28"
                          width="12"
                          height="12"
                          fill="#090b10"
                        />

                        <rect
                          x="16"
                          y="108"
                          width="36"
                          height="36"
                          fill="#090b10"
                        />
                        <rect
                          x="22"
                          y="114"
                          width="24"
                          height="24"
                          fill="#ffffff"
                        />
                        <rect
                          x="28"
                          y="120"
                          width="12"
                          height="12"
                          fill="#090b10"
                        />

                        {/* QR Data modules */}
                        <rect
                          x="64"
                          y="20"
                          width="8"
                          height="8"
                          fill="#090b10"
                        />
                        <rect
                          x="80"
                          y="28"
                          width="12"
                          height="6"
                          fill="#090b10"
                        />
                        <rect
                          x="60"
                          y="60"
                          width="40"
                          height="40"
                          fill="#090b10"
                          rx="4"
                        />
                        <rect
                          x="68"
                          y="68"
                          width="24"
                          height="24"
                          fill="#5eead4"
                        />
                        <rect
                          x="76"
                          y="76"
                          width="8"
                          height="8"
                          fill="#090b10"
                        />
                        <rect
                          x="20"
                          y="64"
                          width="16"
                          height="8"
                          fill="#090b10"
                        />
                        <rect
                          x="110"
                          y="68"
                          width="28"
                          height="8"
                          fill="#090b10"
                        />
                        <rect
                          x="64"
                          y="120"
                          width="20"
                          height="12"
                          fill="#090b10"
                        />
                        <rect
                          x="112"
                          y="112"
                          width="18"
                          height="18"
                          fill="#090b10"
                        />
                      </svg>
                      <span className="qr-brand-tag">UPI 2.0 Dynamic</span>
                    </div>

                    <div className="qr-instructions">
                      <p className="qr-instruction-title">
                        Scan QR with any UPI app
                      </p>
                      <p className="qr-instruction-sub">
                        Google Pay · PhonePe · Paytm · BHIM · Any Banking App
                      </p>
                      <div className="vpa-copy-row">
                        <span className="vpa-label">VPA:</span>
                        <code className="vpa-code">
                          {session.upiDetails?.vpa ?? "growxlabs@icici"}
                        </code>
                        <button
                          type="button"
                          className="btn-copy-mini"
                          onClick={() =>
                            handleCopyVpa(
                              session.upiDetails?.vpa ?? "growxlabs@icici",
                            )
                          }
                        >
                          {copiedVpa ? "Copied ✓" : "Copy"}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {/* Case B: Card */}
              {selectedMethod === "card" ? (
                <div className="card-pane-content">
                  <div className="card-form-simulated">
                    <div className="form-field-group">
                      <label className="form-lbl">Card Number</label>
                      <input
                        type="text"
                        placeholder="4000 0000 0000 0000"
                        className="form-txt-input font-mono"
                        defaultValue="4242 •••• •••• 4242"
                      />
                    </div>
                    <div className="card-row-two">
                      <div className="form-field-group">
                        <label className="form-lbl">Expiry</label>
                        <input
                          type="text"
                          placeholder="MM/YY"
                          className="form-txt-input font-mono"
                          defaultValue="12/28"
                        />
                      </div>
                      <div className="form-field-group">
                        <label className="form-lbl">CVC / CVV</label>
                        <input
                          type="password"
                          placeholder="•••"
                          className="form-txt-input font-mono"
                          defaultValue="123"
                        />
                      </div>
                    </div>
                    <span className="card-security-note">
                      🔒 256-bit TLS encrypted · Direct provider tokenization
                      (PCI-DSS Level 1)
                    </span>
                  </div>
                </div>
              ) : null}

              {/* Case C: Netbanking */}
              {selectedMethod === "netbanking" ? (
                <div className="netbanking-pane-content">
                  <label className="form-lbl">Select Your Bank</label>
                  <select className="form-select-input" defaultValue="hdfc">
                    <option value="hdfc">HDFC Bank</option>
                    <option value="icici">ICICI Bank</option>
                    <option value="sbi">State Bank of India</option>
                    <option value="axis">Axis Bank</option>
                    <option value="kotak">Kotak Mahindra Bank</option>
                  </select>
                  <p className="bank-redirect-note">
                    You will be securely redirected to your bank to authorize
                    the payment.
                  </p>
                </div>
              ) : null}
            </div>

            {/* Footer */}
            <div className="dialog-footer">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setStep("select_amount")}
              >
                ← Back
              </button>
              <button
                type="button"
                className="btn-primary btn-pay-action"
                onClick={handleSimulatePayment}
                disabled={loading}
              >
                {loading
                  ? "Authorizing…"
                  : `Pay ${session.totalAmountFormatted}`}
              </button>
            </div>
          </div>
        ) : null}

        {/* Step 3: Processing */}
        {step === "processing" ? (
          <div className="checkout-step-body checkout-processing-state">
            <div className="processing-spinner-ring" />
            <h3 className="processing-title">
              Verifying Payment with Upstream Rails
            </h3>
            <p className="processing-desc">
              Server-authoritative verification in progress. Please do not close
              this window.
            </p>
          </div>
        ) : null}

        {/* Step 4: Succeeded */}
        {step === "succeeded" && session ? (
          <div className="checkout-step-body checkout-success-state">
            <div className="success-icon-badge">✓</div>
            <h3 className="success-title">Payment Verified & Activated</h3>
            <p className="success-desc">
              <strong>{session.totalAmountFormatted}</strong> in GrowX AI
              credits have been credited to your workspace wallet.
            </p>
            <div className="success-meta-box">
              <div className="meta-line">
                <span>Order ID</span>
                <code>{session.orderId}</code>
              </div>
              <div className="meta-line">
                <span>Session ID</span>
                <code>{session.checkoutSessionId}</code>
              </div>
              <div className="meta-line">
                <span>Status</span>
                <span className="badge-success">SETTLED & ACTIVE</span>
              </div>
            </div>
            <div className="dialog-footer" style={{ marginTop: "24px" }}>
              <button type="button" className="btn-primary" onClick={onClose}>
                Done
              </button>
            </div>
          </div>
        ) : null}

        {/* Step 5: Failed */}
        {step === "failed" ? (
          <div className="checkout-step-body checkout-failed-state">
            <div className="failed-icon-badge">✕</div>
            <h3 className="failed-title">Payment Incomplete</h3>
            <p className="failed-desc">
              {errorMsg ??
                "The payment attempt was not completed or was declined by the issuing bank."}
            </p>
            <div className="dialog-footer" style={{ marginTop: "24px" }}>
              <button type="button" className="btn-secondary" onClick={onClose}>
                Close
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => setStep("select_amount")}
              >
                Try Again
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
