"use client";

import { useState } from "react";

const models = [
  { name: "GPT-4o", requests: 34, pct: 85 },
  { name: "Claude Sonnet", requests: 28, pct: 70 },
  { name: "Gemini Pro", requests: 18, pct: 45 },
  { name: "Grok", requests: 9, pct: 22 },
  { name: "DeepSeek", requests: 7, pct: 17 },
  { name: "Mistral Large", requests: 4, pct: 10 },
];
const tabs = ["Requests", "Latency", "Cost", "Routing"];

export function GatewayViz() {
  const [activeTab, setActiveTab] = useState(tabs[0]);

  return (
    <section className="www-viz" id="models">
      <p className="www-viz-title">Gateway request distribution</p>
      <div className="www-viz-chart">
        {models.map((m) => (
          <div key={m.name} className="www-viz-row">
            <span className="www-viz-label">{m.name}</span>
            <div className="www-viz-track">
              <div className="www-viz-bar" style={{ width: `${m.pct}%` }} />
            </div>
            <span className="www-viz-value">{m.requests}%</span>
          </div>
        ))}
      </div>
      <div className="www-viz-tabs">
        {tabs.map((t) => (
          <button
            key={t}
            className="www-viz-tab"
            aria-selected={t === activeTab}
            onClick={() => setActiveTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
    </section>
  );
}
