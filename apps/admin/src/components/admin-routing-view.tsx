"use client";

import { useState } from "react";
import type { AdminRoutingPolicyItem } from "../lib/admin-data";

export function AdminRoutingView({
  initialPolicies,
}: {
  initialPolicies: AdminRoutingPolicyItem[];
}) {
  const [policies, setPolicies] =
    useState<AdminRoutingPolicyItem[]>(initialPolicies);

  return (
    <div className="admin-page-container" data-testid="admin-routing-root">
      <section
        className="admin-section-box"
        style={{ padding: 0, overflow: "hidden" }}
      >
        <div className="table-responsive-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Policy Name</th>
                <th>Optimization Strategy</th>
                <th>Primary Execution Route</th>
                <th>Fallback Targets</th>
                <th className="num-col">Hysteresis</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {policies.map((pol) => (
                <tr key={pol.id}>
                  <td>
                    <strong className="font-bold">{pol.name}</strong>
                  </td>
                  <td>
                    <span className="badge-subtle font-mono">
                      {pol.strategy.replace(/_/g, " ").toUpperCase()}
                    </span>
                  </td>
                  <td>
                    <code className="font-mono font-bold text-accent-cool">
                      {pol.primaryRoute}
                    </code>
                  </td>
                  <td>
                    <div className="event-badges-wrap">
                      {pol.fallbackChain.map((fb, idx) => (
                        <span key={fb} className="badge-subtle font-mono">
                          {idx + 1}. {fb}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="num-col font-mono">
                    {pol.hysteresisPenaltyMs} ms
                  </td>
                  <td>
                    <span className="badge-success">ACTIVE</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
