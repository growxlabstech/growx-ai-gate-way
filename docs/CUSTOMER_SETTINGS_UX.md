# GrowX AI Gateway — Customer Settings UX Specification (D9)

## 1. Executive Summary & Design Principle

Customer Settings (`/[organizationSlug]/settings` and `/[organizationSlug]/[workspaceSlug]/settings`) serve as operational configuration surfaces for organization administrators and developers. Settings follow a clean, high-density form pattern without oversized visual cards or decorative marketing copy. Every control binds to real backend tenant, membership, security, webhook, and governance models.

---

## 2. Information Architecture & Navigation

```
Customer Settings Architecture
│
├── Organization Scope (/[org]/...)
│   ├── Organization Profile & Metadata (/settings)
│   ├── Team Members & RBAC Roles (/members)
│   ├── Pending Invitations (/invitations)
│   ├── Teams & Scopes (/teams)
│   └── Danger Zone: Governed Organization Deletion
│
└── Workspace Scope (/[org]/[workspace]/...)
    ├── Workspace Profile & Environment Boundaries (/settings)
    ├── Phase-35 Data Retention & Prompt Governance (/settings)
    ├── Webhook Endpoints (/webhooks)
    │   ├── HTTPS Endpoint Registration
    │   ├── Display-Once HMAC-SHA256 Signing Secrets
    │   └── Live Test Event Delivery Verification
    └── Danger Zone: Governed Workspace Deletion
```

---

## 3. Team & Membership Governance (Phase 2 RBAC)

- **Supported Roles**: `Owner`, `Admin`, `Developer`, `Billing Manager`, `Viewer`.
- **Last Owner Invariant**: The UI enforces that an organization must always retain at least one active Owner. Attempting to demote or remove the last remaining Owner is blocked with explicit feedback.
- **Invitation Lifecycle**: Pending invites display expiration timestamps and can be revoked before acceptance.

---

## 4. Webhook Security & Signing Secrets (Phase 21)

- **HTTPS Mandatory**: Customer webhook endpoints must provide a valid HTTPS URI to protect transmitted event payloads against eavesdropping.
- **Display-Once Signing Secret**: When a new webhook endpoint is registered, a cryptographic signing secret (`whsec_...`) is generated and shown **exactly once** in a prominent warning banner. Once dismissed, the raw secret is permanently encrypted in the backend (AES-256-GCM) and cannot be recovered in plaintext from the browser.
- **HMAC-SHA256 Delivery Verification**: Test pings compute an authentic signature over the test payload and verify HTTP 200 responses.

---

## 5. Phase-35 Governed Deletion (Danger Zone)

- **Explicit Confirmation**: Destructive actions (deleting an organization or workspace) require the user to type the exact entity name into a dedicated confirmation field.
- **Governed Pipeline**: Deletion does not issue simple naive database row deletes; it schedules Phase-35 governance workflows ensuring all active keys, routing aliases, and leases are cleanly de-provisioned.
