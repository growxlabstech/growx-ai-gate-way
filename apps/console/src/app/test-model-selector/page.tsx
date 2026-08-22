"use client";

import { useEffect, useState } from "react";
import { ModelSelector } from "../../components/models/model-selector";
import { CANONICAL_GROWX_MODELS } from "../../lib/models-data";

export default function TestModelSelectorPage() {
  const [selectedModel, setSelectedModel] = useState("growx/fast");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  return (
    <main
      data-hydrated={hydrated ? "true" : "false"}
      style={{
        padding: "40px",
        maxWidth: "600px",
        margin: "0 auto",
        background: "#0a0b0d",
        minHeight: "100vh",
        color: "#fff",
      }}
    >
      <h1>Model Selector Test Harness</h1>
      <div style={{ marginTop: "24px" }}>
        <label
          style={{
            display: "block",
            marginBottom: "8px",
            fontSize: "13px",
            color: "#94a3b8",
          }}
        >
          Target Model
        </label>
        <ModelSelector
          id="test-model-select"
          models={CANONICAL_GROWX_MODELS}
          selectedModelId={selectedModel}
          onSelect={(id) => setSelectedModel(id)}
        />
      </div>

      <div
        style={{
          marginTop: "32px",
          padding: "16px",
          background: "#13151a",
          borderRadius: "8px",
          border: "1px solid #222631",
        }}
      >
        <span style={{ fontSize: "12px", color: "#94a3b8" }}>
          Active Selection Output:
        </span>
        <div
          id="emitted-model-id"
          style={{
            fontSize: "16px",
            fontWeight: "bold",
            fontFamily: "monospace",
            color: "#38bdf8",
            marginTop: "4px",
          }}
        >
          {selectedModel}
        </div>
      </div>
    </main>
  );
}
