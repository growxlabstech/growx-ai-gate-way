"use client";

import { useState } from "react";
import type {
  PlaygroundMessage,
  PlaygroundParameters,
  PlaygroundStructuredOutput,
  PlaygroundToolDefinition,
} from "../../lib/playground-types";

interface CodeExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  modelId: string;
  messages: PlaygroundMessage[];
  parameters: PlaygroundParameters;
  tools: PlaygroundToolDefinition[];
  structuredOutput: PlaygroundStructuredOutput;
}

export function CodeExportModal({
  isOpen,
  onClose,
  modelId,
  messages,
  parameters,
  tools,
  structuredOutput,
}: CodeExportModalProps) {
  const [activeTab, setActiveTab] = useState<"curl" | "typescript" | "python">(
    "curl",
  );
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  // Build canonical request payload
  const payload: any = {
    model: modelId,
    messages: messages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
    stream: parameters.stream,
    temperature: parameters.temperature,
    max_tokens: parameters.maxTokens,
  };

  if (parameters.topP !== 1.0) payload.top_p = parameters.topP;
  if (parameters.seed !== undefined) payload.seed = parameters.seed;
  if (parameters.stop.length > 0) payload.stop = parameters.stop;
  if (parameters.reasoningEffort)
    payload.reasoning_effort = parameters.reasoningEffort;

  const validTools = tools
    .filter((t) => t.name.trim() && t.isValid)
    .map((t) => {
      let params = {};
      try {
        params = JSON.parse(t.parametersJson);
      } catch {}
      return {
        type: "function",
        function: {
          name: t.name.trim(),
          description: t.description.trim(),
          parameters: params,
        },
      };
    });

  if (validTools.length > 0) {
    payload.tools = validTools;
  }

  if (structuredOutput.enabled && structuredOutput.isValid) {
    let schema = {};
    try {
      schema = JSON.parse(structuredOutput.schemaJson);
    } catch {}
    payload.response_format = {
      type: "json_schema",
      json_schema: {
        name: structuredOutput.name.trim() || "response",
        strict: structuredOutput.strict,
        schema,
      },
    };
  }

  const payloadJson = JSON.stringify(payload, null, 2);

  // Generate cURL snippet
  const curlCode = `curl https://api.growx.ai/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $GROWX_API_KEY" \\
  -d '${payloadJson.replace(/'/g, "'\\''")}'`;

  // Generate TypeScript snippet
  const tsCode = `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.GROWX_API_KEY,
  baseURL: "https://api.growx.ai/v1",
});

async function main() {
  const stream = await client.chat.completions.create(${payloadJson});

  for await (const chunk of stream) {
    process.stdout.write(chunk.choices[0]?.delta?.content || "");
  }
}

main().catch(console.error);`;

  // Generate Python snippet
  const pyCode = `import os
from openai import OpenAI

client = OpenAI(
    api_key=os.environ.get("GROWX_API_KEY"),
    base_url="https://api.growx.ai/v1",
)

response = client.chat.completions.create(
    model="${modelId}",
    messages=${JSON.stringify(payload.messages, null, 4)
      .replace(/"role"/g, "'role'")
      .replace(/"content"/g, "'content'")},
    stream=${parameters.stream ? "True" : "False"},
    temperature=${parameters.temperature},
    max_tokens=${parameters.maxTokens},
)

for chunk in response:
    print(chunk.choices[0].delta.content or "", end="", flush=True)
`;

  const codeToShow =
    activeTab === "curl"
      ? curlCode
      : activeTab === "typescript"
        ? tsCode
        : pyCode;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(codeToShow);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-content code-export-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="code-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 id="code-modal-title" className="modal-title">
            View Request Code
          </h2>
          <button
            type="button"
            className="btn-close-icon"
            onClick={onClose}
            aria-label="Close dialog"
          >
            ✕
          </button>
        </div>

        <div className="code-export-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "curl"}
            className={`code-tab-btn ${activeTab === "curl" ? "is-active" : ""}`}
            onClick={() => setActiveTab("curl")}
          >
            cURL
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "typescript"}
            className={`code-tab-btn ${activeTab === "typescript" ? "is-active" : ""}`}
            onClick={() => setActiveTab("typescript")}
          >
            TypeScript / Node.js
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "python"}
            className={`code-tab-btn ${activeTab === "python" ? "is-active" : ""}`}
            onClick={() => setActiveTab("python")}
          >
            Python
          </button>
        </div>

        <div className="code-block-wrap">
          <pre className="code-snippet-pre">
            <code>{codeToShow}</code>
          </pre>
          <button
            type="button"
            className="btn-copy-code"
            onClick={handleCopy}
            aria-label="Copy snippet to clipboard"
          >
            {copied ? "Copied ✓" : "Copy code"}
          </button>
        </div>

        <div
          className="modal-actions"
          style={{ justifyContent: "flex-end", marginTop: "16px" }}
        >
          <button type="button" className="btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
