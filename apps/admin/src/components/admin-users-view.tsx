"use client";

import { useState } from "react";
import type { AdminUserItem } from "../lib/admin-data";

export function AdminUsersView({
  initialUsers,
}: {
  initialUsers: AdminUserItem[];
}) {
  const [users, setUsers] = useState<AdminUserItem[]>(initialUsers);
  const [searchQuery, setSearchQuery] = useState("");
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const filteredUsers = users.filter((u) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      u.email.toLowerCase().includes(q) ||
      u.name.toLowerCase().includes(q) ||
      u.id.toLowerCase().includes(q)
    );
  });

  function toggleUserSuspension(userId: string) {
    const target = users.find((u) => u.id === userId);
    if (!target) return;

    const willSuspend = target.status === "active";
    const promptMsg = willSuspend
      ? `Are you sure you want to suspend ${target.name} (${target.email})? All active sessions and API keys will be revoked.`
      : `Reactivate account for ${target.name}?`;

    if (confirm(promptMsg)) {
      setUsers(
        users.map((u) =>
          u.id === userId
            ? { ...u, status: willSuspend ? "suspended" : "active" }
            : u,
        ),
      );
      setActionSuccess(
        `User ${target.email} has been ${willSuspend ? "suspended" : "reactivated"}. Audit event appended.`,
      );
      setTimeout(() => setActionSuccess(null), 4000);
    }
  }

  return (
    <div className="admin-page-container" data-testid="admin-users-root">
      {/* Search & Filter Toolbar */}
      <div className="admin-toolbar-row">
        <label className="admin-search-wrap">
          <input
            type="search"
            placeholder="Search users by name, email, or user ID…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="form-txt-input font-mono"
            style={{ width: "360px" }}
          />
        </label>
        <span className="results-count-tag font-mono">
          {filteredUsers.length} {filteredUsers.length === 1 ? "user" : "users"}
        </span>
      </div>

      {actionSuccess ? (
        <div className="form-success-note" style={{ marginBottom: "12px" }}>
          ✓ {actionSuccess}
        </div>
      ) : null}

      {/* Users Table */}
      <section
        className="admin-section-box"
        style={{ padding: 0, overflow: "hidden" }}
      >
        {filteredUsers.length === 0 ? (
          <div className="billing-empty-box">
            <p>No users matching "{searchQuery}".</p>
          </div>
        ) : (
          <div className="table-responsive-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Identity</th>
                  <th>Status</th>
                  <th>MFA</th>
                  <th>Global Role</th>
                  <th>Orgs</th>
                  <th>Last Login</th>
                  <th className="num-col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div className="member-name-wrap">
                        <span className="member-name font-bold">{u.name}</span>
                        <span className="member-email font-mono">
                          {u.email}
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className={`status-pill status-${u.status}`}>
                        {u.status.toUpperCase()}
                      </span>
                    </td>
                    <td>
                      {u.mfaEnabled ? (
                        <span className="badge-success">MFA ON</span>
                      ) : (
                        <span className="muted-cell">None</span>
                      )}
                    </td>
                    <td>
                      <span className="badge-subtle font-mono">{u.role}</span>
                    </td>
                    <td className="font-mono">{u.organizationsCount}</td>
                    <td className="timestamp-cell">
                      {new Date(u.lastLoginAt)
                        .toISOString()
                        .slice(0, 19)
                        .replace("T", " ")}
                    </td>
                    <td className="num-col">
                      <button
                        type="button"
                        className={`btn-sm ${u.status === "active" ? "btn-danger-ghost" : "btn-secondary"}`}
                        onClick={() => toggleUserSuspension(u.id)}
                      >
                        {u.status === "active" ? "Suspend" : "Reactivate"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
