# GrowX AI Gateway — Billing & Credits UX Specification (D8)

## 1. Executive Summary & Objective

The Billing & Credits dashboard (`/[organizationSlug]/[workspaceSlug]/billing`) is the authoritative commercial hub for GrowX AI Gateway customers. It allows workspace administrators and finance managers to monitor prepaid credit balances, track spend across billing periods, inspect commercial subscription plans and Phase-18 entitlements, view immutable ledger transactions, manage legal tax entities, and download verified tax invoices without exposing provider secrets or relying on unsafe browser calculations.

---

## 2. Financial Domain Separation & Invariants

| Domain Entity       | Canonical Backend Authority                        | UI Representation                                                      |
| ------------------- | -------------------------------------------------- | ---------------------------------------------------------------------- |
| **Order**           | Phase 19 Checkout / Order Engine                   | Exact line items, package amounts, subtotal, and tax                   |
| **Payment Intent**  | Phase 19 Payment Intent Record                     | Server-authoritative intent to collect money                           |
| **Payment Attempt** | Phase 19 Payment Attempt                           | Provider/rail-specific execution target (UPI/Card/Netbanking)          |
| **Payment**         | Phase 19 Payment Entity                            | Confirmed customer money movement (status: `succeeded` / `failed`)     |
| **Wallet / Credit** | Phase 17 Wallet Ledger (`@growx/credits`)          | Consumable prepaid credit balance (`available`, `reserved`, `total`)   |
| **Subscription**    | Phase 18 Commercial Subscriptions                  | Plan name, billing interval, renewal date                              |
| **Entitlement**     | Phase 18 Entitlement Gate (`@growx/subscriptions`) | Specific limits: RPM, TPM, parallel streams, model access              |
| **Invoice**         | Phase 20 Invoice & Tax Engine (`@growx/billing`)   | Official legal document with number, tax lines (GST/VAT), download URL |

---

## 3. High-Level Visual & Information Architecture

```
Billing & Credits (/[organizationSlug]/[workspaceSlug]/billing)
│
├── Financial Summary Cards
│   ├── Available Wallet Balance (with active/low-balance warning & reserved credits)
│   ├── Current Period Spend (with auto-topup threshold and status)
│   └── Commercial Plan (with RPM/TPM/Concurrency entitlement summary)
│
├── Primary Action (+ Add Credits)
│   └── Opens GrowX-Owned Checkout Dialog
│
└── Tabbed Details Section
    ├── Transactions: Ledger entries with sequence, type, amount, status, balance impact
    ├── Invoices: Tax invoices with number, period, total, status, download PDF
    ├── Billing Profile & Tax: Legal business name, billing email, Tax ID/EIN/GSTIN, address
    └── Plan & Entitlements: Fine-grained limits (RPM, TPM, Parallel streams, Multimodal, SLA)
```

---

## 4. Wallet & Credit Ledger Mechanics

- **No Float Money**: All monetary amounts are formatted from exact decimal strings or minor units (`toMinorUnits` / `fromMinorUnits`).
- **No Client Calculations**: Balance is never calculated as `previousBalance - browserUsage`. The Phase-17 Wallet is the sole financial authority.
- **Reserved Credits**: Displays reserved/pre-authorized credits for active batch jobs and parallel streaming requests when applicable (e.g. `Reserved: $15.00 · Total: $465.00`).
- **Low Balance & Auto-Topup**: Restrained warning state when available balance drops below configured threshold (e.g. `$50.00`). If auto-topup is active, displays top-up package trigger amount.

---

## 5. Transactions vs Invoices Distinction

- **Transactions (`WalletLedgerEntry`)**:
  - Record every atomic credit and debit operation on the wallet ledger.
  - Types: `credit_purchase`, `credit_grant`, `usage_settlement`, `refund`, `adjustment_credit`, `adjustment_debit`.
  - Color-coded amounts (`+$200.00` green for credits, `-$50.00` primary text for debits).
  - Displays resulting balance after each transaction.
- **Invoices (`Invoice`)**:
  - Official tax and billing documents generated for purchases, subscription renewals, or monthly summaries.
  - Number format: `INV-YYYY-XXXX` (e.g. `INV-2026-0081`).
  - Contains subtotal, tax lines (CGST/SGST/IGST/VAT), total, payment status (`paid`, `open`, `void`), and 1-click PDF download link.

---

## 6. Multi-Tenant Scoping & Security

- **Organization-Level Scoping**: Billing accounts and credit wallets are scoped to the active organization (`organizationId`). Switching workspaces within the same organization preserves the shared organizational credit pool without data fragmentation.
- **Cross-Tenant Access Denial**: Attempting to access foreign invoice IDs, transaction references, or checkout sessions fails closed with `404 Not Found` or `403 Forbidden`.
- **Zero Secret Leakage**: Upstream payment gateway merchant keys, webhook signing secrets, and raw card details are never exposed to client browsers or logs.
