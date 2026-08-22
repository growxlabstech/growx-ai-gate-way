"use client";

import { useState } from "react";
import type {
  MemberRole,
  OrganizationMemberItem,
  PendingInvitationItem,
} from "../../lib/settings-data";

interface TeamMembersViewProps {
  organizationSlug: string;
  initialMembers: OrganizationMemberItem[];
  initialInvitations: PendingInvitationItem[];
}

export function TeamMembersView({
  organizationSlug,
  initialMembers,
  initialInvitations,
}: TeamMembersViewProps) {
  const [members, setMembers] =
    useState<OrganizationMemberItem[]>(initialMembers);
  const [invitations, setInvitations] =
    useState<PendingInvitationItem[]>(initialInvitations);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<MemberRole>("Developer");
  const [inviting, setInviting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Safety count
  const ownerCount = members.filter((m) => m.role === "Owner").length;

  async function handleSendInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim() || !inviteEmail.includes("@")) {
      setErrorMsg("Please provide a valid email address");
      return;
    }

    setInviting(true);
    setErrorMsg(null);

    await new Promise((resolve) => setTimeout(resolve, 400));

    const newInvite: PendingInvitationItem = {
      id: `inv_ns_${Date.now()}`,
      email: inviteEmail.trim(),
      role: inviteRole,
      invitedBy: "alex@northstar.example.com",
      invitedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 7 * 86400 * 1000).toISOString(),
      status: "pending",
    };

    setInvitations([newInvite, ...invitations]);
    setInviting(false);
    setInviteEmail("");
    setInviteModalOpen(false);
  }

  function handleRevokeInvite(inviteId: string) {
    setInvitations(invitations.filter((i) => i.id !== inviteId));
  }

  function handleRoleChange(memberId: string, newRole: MemberRole) {
    const target = members.find((m) => m.id === memberId);
    if (!target) return;

    if (target.role === "Owner" && newRole !== "Owner" && ownerCount <= 1) {
      alert(
        "Cannot change role. An organization must have at least one active Owner.",
      );
      return;
    }

    setMembers(
      members.map((m) => (m.id === memberId ? { ...m, role: newRole } : m)),
    );
  }

  function handleRemoveMember(memberId: string) {
    const target = members.find((m) => m.id === memberId);
    if (!target) return;

    if (target.role === "Owner" && ownerCount <= 1) {
      alert("Cannot remove the last Owner of this organization.");
      return;
    }

    if (
      confirm(
        `Are you sure you want to remove ${target.name || target.email} from the organization?`,
      )
    ) {
      setMembers(members.filter((m) => m.id !== memberId));
    }
  }

  return (
    <div className="settings-page-container" data-testid="team-members-root">
      {/* 1. Header Toolbar */}
      <div className="settings-header-toolbar">
        <div>
          <h2 className="section-title">Organization Members</h2>
          <p className="section-subtitle">
            Manage user roles, RBAC capabilities, and team access across all
            workspaces.
          </p>
        </div>
        <button
          type="button"
          className="btn-primary"
          onClick={() => setInviteModalOpen(true)}
          id="invite-member-btn"
        >
          + Invite Member
        </button>
      </div>

      {/* 2. Active Members Table */}
      <section
        className="settings-section-card"
        style={{ padding: 0, overflow: "hidden" }}
      >
        <div className="table-responsive-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Member</th>
                <th>Role</th>
                <th>Joined Date</th>
                <th className="num-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {members.map((mem) => (
                <tr key={mem.id}>
                  <td>
                    <div className="member-cell">
                      <div className="avatar-circle">
                        {mem.name
                          ? mem.name.charAt(0).toUpperCase()
                          : mem.email.charAt(0).toUpperCase()}
                      </div>
                      <div className="member-name-wrap">
                        <span className="member-name font-bold">
                          {mem.name || "Workspace Member"}{" "}
                          {mem.isCurrentUser ? (
                            <span className="badge-subtle font-mono">
                              (You)
                            </span>
                          ) : null}
                        </span>
                        <span className="member-email">{mem.email}</span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <select
                      value={mem.role}
                      onChange={(e) =>
                        handleRoleChange(mem.id, e.target.value as MemberRole)
                      }
                      className="form-select-input member-role-select"
                      disabled={mem.role === "Owner" && ownerCount <= 1}
                      aria-label={`Role for ${mem.name || mem.email}`}
                    >
                      <option value="Owner">Owner</option>
                      <option value="Admin">Admin</option>
                      <option value="Developer">Developer</option>
                      <option value="Billing Manager">Billing Manager</option>
                      <option value="Viewer">Viewer</option>
                    </select>
                  </td>
                  <td className="timestamp-cell">
                    {new Date(mem.joinedAt).toLocaleDateString()}
                  </td>
                  <td className="num-col">
                    <button
                      type="button"
                      className="btn-danger-ghost btn-sm"
                      onClick={() => handleRemoveMember(mem.id)}
                      disabled={mem.role === "Owner" && ownerCount <= 1}
                      aria-label={`Remove ${mem.name || mem.email}`}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 3. Pending Invitations Section */}
      <section className="settings-section-card" style={{ marginTop: "24px" }}>
        <div className="section-header-block">
          <h3 className="section-title">
            Pending Invitations ({invitations.length})
          </h3>
          <p className="section-subtitle">
            Users who have been invited to join this organization but have not
            yet accepted.
          </p>
        </div>

        {invitations.length === 0 ? (
          <div className="billing-empty-box">
            <p>No pending invitations.</p>
          </div>
        ) : (
          <div
            className="table-responsive-wrapper"
            style={{ marginTop: "12px" }}
          >
            <table className="data-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Assigned Role</th>
                  <th>Invited By</th>
                  <th>Status</th>
                  <th className="num-col">Action</th>
                </tr>
              </thead>
              <tbody>
                {invitations.map((inv) => (
                  <tr key={inv.id}>
                    <td>
                      <code>{inv.email}</code>
                    </td>
                    <td>
                      <span className="badge-subtle font-mono">{inv.role}</span>
                    </td>
                    <td className="muted-cell">{inv.invitedBy}</td>
                    <td>
                      <span className="status-pill status-pending">
                        PENDING
                      </span>
                    </td>
                    <td className="num-col">
                      <button
                        type="button"
                        className="btn-secondary btn-sm"
                        onClick={() => handleRevokeInvite(inv.id)}
                      >
                        Revoke
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 4. Invite Member Dialog */}
      {inviteModalOpen ? (
        <div
          className="dialog-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="invite-title"
        >
          <div className="dialog-card" style={{ maxWidth: "460px" }}>
            <div className="dialog-header">
              <h3 id="invite-title" className="dialog-title">
                Invite Organization Member
              </h3>
              <button
                type="button"
                className="dialog-close-btn"
                onClick={() => setInviteModalOpen(false)}
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
              onSubmit={handleSendInvite}
              className="settings-form"
              style={{ marginTop: "12px" }}
            >
              <div className="form-field-group">
                <label htmlFor="invite-email-input" className="form-label">
                  Email Address
                </label>
                <input
                  id="invite-email-input"
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="developer@company.com"
                  className="form-txt-input"
                  required
                />
              </div>

              <div className="form-field-group">
                <label htmlFor="invite-role-select" className="form-label">
                  Initial RBAC Role
                </label>
                <select
                  id="invite-role-select"
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as MemberRole)}
                  className="form-select-input"
                >
                  <option value="Admin">
                    Admin (Full organization control)
                  </option>
                  <option value="Developer">
                    Developer (API keys, models, logs, playground)
                  </option>
                  <option value="Billing Manager">
                    Billing Manager (Wallet, invoices, checkout)
                  </option>
                  <option value="Viewer">
                    Viewer (Read-only analytics & metrics)
                  </option>
                </select>
              </div>

              <div className="dialog-footer" style={{ marginTop: "20px" }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setInviteModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={inviting}
                >
                  {inviting ? "Sending Invite…" : "Send Invitation"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
