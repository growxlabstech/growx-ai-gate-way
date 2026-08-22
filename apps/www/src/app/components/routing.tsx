import React from "react";

export function Routing() {
  return (
    <section className="www-section">
      <h2 className="www-heading">Route by capability, policy or model</h2>
      <p className="www-body">
        The gateway evaluates routing policies to select the best model for each
        request. Policies consider cost, latency, reliability, capacity and
        tenant preferences using a normalized scoring formula.
      </p>
      <div className="www-routing-tree">
        {`request
  ↓
policy evaluation
  ├── `}
        <span className="accent">primary model</span>
        {` (score: 0.92)
  ├── `}
        <span className="accent">fallback model</span>
        {` (score: 0.78)
  └── `}
        <span className="accent">emergency fallback</span>
        {` (static route)`}
      </div>
      <div className="www-dimensions">
        <span className="www-dimension">latency</span>
        <span className="www-dimension">availability</span>
        <span className="www-dimension">cost</span>
        <span className="www-dimension">capability</span>
        <span className="www-dimension">tenant policy</span>
      </div>
      <p className="www-body" style={{ marginTop: "24px" }}>
        Resilience modes adapt routing behavior automatically:{" "}
        <strong style={{ color: "var(--gx-frost-300)" }}>NORMAL</strong> for
        full intelligent scoring,{" "}
        <strong style={{ color: "var(--gx-frost-300)" }}>DEGRADED</strong> to
        disable experimentation,{" "}
        <strong style={{ color: "var(--gx-frost-300)" }}>EMERGENCY</strong> for
        audited static fallback routes.
      </p>
    </section>
  );
}
