import React from "react";

export function Observability() {
  const metrics = [
    { value: "12.4k", label: "Requests" },
    { value: "2.1M", label: "Tokens" },
    { value: "142ms", label: "TTFT" },
    { value: "1.8s", label: "Latency" },
    { value: "0.3%", label: "Errors" },
    { value: "$847", label: "Spend" },
  ];

  const fields = [
    { key: "request_id", val: "req_8f3k2x9v" },
    { key: "provider", val: "openai" },
    { key: "model", val: "gpt-4o", accent: true },
    { key: "routing", val: "policy:default" },
    { key: "tokens_in", val: "128" },
    { key: "tokens_out", val: "512" },
    { key: "latency", val: "1,842ms" },
    { key: "status", val: "200" },
    { key: "cost", val: "$0.0084" },
    { key: "ttft", val: "142ms", accent: true },
  ];

  return (
    <section className="www-section">
      <h2 className="www-heading">See what happens to every request</h2>
      <p className="www-body">
        Every gateway request is instrumented with structured telemetry.
        Prometheus metrics, OpenTelemetry traces, and structured logging give
        you full visibility into model performance.
      </p>
      <div className="www-metrics">
        {metrics.map((m) => (
          <div key={m.label} className="www-metric">
            <div className="www-metric-value">{m.value}</div>
            <div className="www-metric-label">{m.label}</div>
          </div>
        ))}
      </div>
      <p className="www-label" style={{ marginBottom: "12px" }}>
        Request inspection
      </p>
      <div className="www-inspection">
        {fields.map((f) => (
          <div key={f.key} className="www-inspection-field">
            <div className="www-inspection-key">{f.key}</div>
            <div className={`www-inspection-val${f.accent ? " accent" : ""}`}>
              {f.val}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
