"use client";

import { useState } from "react";

export function CodeExample() {
  const [copied, setCopied] = useState(false);

  const rawCode = `curl https://gateway.growx.ai/v1/chat/completions \\
  -H "Authorization: Bearer gx_live_k_xxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-4o",
    "messages": [
      { "role": "user", "content": "Hello" }
    ],
    "stream": true
  }'`;

  const handleCopy = () => {
    navigator.clipboard.writeText(rawCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <section className="www-section">
      <h2 className="www-heading">One API for every model</h2>
      <p className="www-body">
        Use the OpenAI-compatible chat completions endpoint. Swap models by
        changing a single parameter.
      </p>
      <p className="www-code-label">POST /v1/chat/completions</p>
      <div className="www-code">
        <button className="www-code-copy" onClick={handleCopy}>
          {copied ? "Copied" : "Copy"}
        </button>
        <pre>
          <code>
            <span className="kw">curl</span>{" "}
            <span className="str">
              https://gateway.growx.ai/v1/chat/completions
            </span>{" "}
            \
            <br />
            {"  "}
            <span className="kw">-H</span>{" "}
            <span className="str">"Authorization: Bearer gx_live_k_xxxxx"</span>{" "}
            \
            <br />
            {"  "}
            <span className="kw">-H</span>{" "}
            <span className="str">"Content-Type: application/json"</span> \
            <br />
            {"  "}
            <span className="kw">-d</span>{" "}
            <span className="str">
              '
              {`{
    "model": "gpt-4o",
    "messages": [
      { "role": "user", "content": "Hello" }
    ],
    "stream": true
  }`}
              '
            </span>
          </code>
        </pre>
      </div>
    </section>
  );
}
