# GrowX AI Gateway — Checkout & Payment Rails UX Specification (D8)

## 1. Executive Summary & Design Principle

The GrowX Checkout Experience provides a unified, branded, high-trust checkout surface owned entirely by GrowX. Upstream payment providers (e.g. UPI rails, Stripe, Razorpay, Cashfree) operate as abstracted execution targets behind standard GrowX interfaces. The customer experiences a fast, quiet, precision-engineered checkout flow without generic third-party popups or icy neon gimmicks.

---

## 2. Checkout State Lifecycle

```
[Select Package / Amount]
           ↓
[Create CheckoutSession] (POST /api/.../billing/checkout)
           ↓
[Order Summary & Method Selection] (UPI / Card / Netbanking)
           ↓
[Payment Execution / Scanning Dynamic QR]
           ↓
[Server Verification Loop] (GET /api/.../billing/checkout/:id/status)
           ↓
[Succeeded & Activated] → Instant Balance & Transaction Revalidation
```

---

## 3. Supported Payment Rails & Abstraction

1. **UPI / Dynamic QR**:
   - Generates unique server-bound UPI QR code payload (`upi://pay?pa=growxlabs@icici&am=...&tr=ord_...`).
   - Displays real-time session expiry countdown (15 minutes).
   - Shows VPA (`growxlabs@icici`) with 1-click clipboard copy.
   - Compatible with Google Pay, PhonePe, Paytm, BHIM, and all UPI 2.0 banking applications.
   - Closing the QR dialog does NOT cancel the backend payment attempt; reopening recovers active attempt state.
2. **Credit / Debit Cards**:
   - Secure tokenization fields adhering to PCI-DSS Level 1.
   - Raw PAN, CVV, and expiry dates are never stored in GrowX databases, logs, or local storage.
   - Supports 3D Secure / OTP external banking authorization redirects when required.
3. **Net Banking**:
   - Supports direct bank transfers from leading partner banks (HDFC, ICICI, SBI, Axis, Kotak).

---

## 4. Server-Side Verification & Anti-Tampering Rules

- **Never Trust Client Success**: The client browser cannot mark an order paid via query parameters (e.g. `?success=true`) or manual callback functions.
- **Server-Authoritative Confirmation**: The payment is confirmed exclusively when:
  1. The upstream provider issues a cryptographically signed webhook to `/webhooks/payments/:provider`.
  2. Or the GrowX Payment Engine verifies transaction status directly with the payment rail.
- **Idempotent Credit Grants**: Replaying duplicate webhooks or multiple polling requests never creates duplicate wallet credits or invoices.
- **Immediate Revalidation**: Upon verified completion, the UI revalidates the local wallet balance, ledger transactions, and invoice lists without requiring a hard page reload.

---

## 5. Error Recovery & Session Expiration

- **Session Expiry**: When the 15-minute checkout timer expires, the UI cleanly transitions to an expired state with a `Try Again` action that safely initializes a new `CheckoutSession`.
- **Payment Decline**: Issuing bank declines display human-readable, safe error reasons (e.g. `Insufficient funds`, `Bank declined authorization`) without exposing internal stack traces.
