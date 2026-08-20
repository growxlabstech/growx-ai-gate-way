import React from "react";

export function Security() {
  const capabilities = [
    "HMAC-SHA-256 API key hashing with server pepper",
    "Scoped API key permissions and model authorization",
    "Workspace and organization tenant isolation",
    "Deny-first model authorization policies",
    "IP allowlisting with IPv4 and IPv6 CIDR ranges",
    "Per-key, workspace, and organization rate limits",
    "Concurrency leases with safety TTL",
    "Spending limits and budget enforcement",
    "Fail-closed security pipeline on uncertainty",
    "Structured audit events for privileged operations",
    "Provider credential isolation and redaction",
    "Enterprise SSO via SAML and OIDC (coming)"
  ];

  return (
    <section className="www-section" id="enterprise">
      <h2 className="www-heading">Control access without losing developer velocity</h2>
      <p className="www-body">The gateway enforces a fail-closed security pipeline. Every request passes through authentication, authorization, IP validation, rate limiting, concurrency control, and budget enforcement before reaching any AI provider.</p>
      <div className="www-caps">
        {capabilities.map(c => (
          <div key={c} className="www-cap">
            <span className="www-cap-marker" />
            <span>{c}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
