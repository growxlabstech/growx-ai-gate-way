# GrowX AI Gateway — Developer Experience (DX) Certification Report

**Certification Date**: August 22, 2026  
**Scope**: Public Developer Tooling, TypeScript SDK, Command Line Interface (CLI), OpenAPI Contract, and Getting Started Documentation  
**Status**: **`CERTIFIED`**

---

## 1. Developer Tooling Matrix

| Tool / Interface            | Package / Command            | Current Version | Supported Runtimes                 |    Status    |
| :-------------------------- | :--------------------------- | :-------------: | :--------------------------------- | :----------: |
| **Official TypeScript SDK** | `@growx/ai`                  |    `v0.1.0`     | Node.js 18+, Bun, Deno, Edge       | ✅ Certified |
| **GrowX CLI**               | `@growx/cli` (`growx`)       |    `v0.1.0`     | Node.js 20+, Windows, Linux, macOS | ✅ Certified |
| **cURL / Public REST API**  | `https://api.growxlabs.tech` |      `v1`       | Any HTTP/SSE client                | ✅ Certified |
| **OpenAPI 3.1 Contract**    | `@growx/contracts`           |    `v1.0.0`     | Swagger, Postman, CodeGen          | ✅ Certified |

---

## 2. TypeScript SDK Certification (`@growx/ai`)

### 2.1 Clean Project Quickstart Snippet

```typescript
import { GrowXAI } from "@growx/ai";

const client = new GrowXAI({
  apiKey: process.env.GROWX_API_KEY!,
});

// Non-streaming completion
const response = await client.chat.completions.create({
  model: "growx/fast",
  messages: [{ role: "user", content: "Hello, GrowX!" }],
});
console.log(response.choices[0].message.content);

// Streaming completion
const stream = await client.responses.stream({
  model: "growx/fast",
  input: "Stream a story about distributed systems.",
});
for await (const chunk of stream) {
  process.stdout.write(chunk.content ?? "");
}
```

### 2.2 Error Hierarchy & Handling

The SDK provides strongly-typed errors mapped from Gateway HTTP status codes:

- `AuthenticationError` (401 Unauthorized)
- `PermissionError` (403 Forbidden)
- `BillingError` (402 Payment Required)
- `RateLimitError` (429 Too Many Requests)
- `ModelError` (400 Invalid Model)
- `ProviderError` (502/503 Upstream Error)
- `TimeoutError` (408/504 Timeout)

---

## 3. Command Line Interface Certification (`@growx/cli`)

### 3.1 Command Discovery & Execution

- **`growx help`**: Prints comprehensive command list and flags.
- **`growx auth <api-key>`**: Persists API key securely in configuration.
- **`growx models list [--json]`**: Fetches active models and formats as tabular text or machine-readable JSON.
- **`growx chat "<prompt>" [model] [--json]`**: Sends non-streaming or streaming inference request and outputs stdout.
- **`growx config`**: Outputs active API hostname (`https://api.growxlabs.tech`) and CLI version.

### 3.2 Non-Zero Exit Codes

- Invalid arguments or failed requests return exit code `1` with clean error messages on `stderr`.

---

## 4. Getting Started Documentation Verification

### 4.1 Canonical cURL Request

```bash
curl -X POST https://api.growxlabs.tech/v1/chat/completions \
  -H "Authorization: Bearer $GROWX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "growx/fast",
    "messages": [
      {"role": "user", "content": "Explain database indexing in 2 sentences."}
    ],
    "stream": true
  }'
```

- **Response Headers**: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `x-growx-request-id: req_...`
- **Output**: Delivered in standard OpenAI-compatible SSE chunks (`data: {...}\n\ndata: [DONE]\n\n`).

---

## 5. Request ID & Observability Correlation

Every inference execution correlates across all platform layers using the canonical Request ID:

1. **Public API Response Header**: `x-growx-request-id: req_01jq8a9x71`
2. **Console Request History (D7)**: Filterable by `req_01jq8a9x71`
3. **Operator Admin Inspector**: Traceable by `req_01jq8a9x71`
4. **Structured Pino Logs / OTel Traces**: Tagged with `requestId: "req_01jq8a9x71"`

---

## 6. Developer Friction Audit & Findings

| Severity | Area       | Finding / Friction Point                                            | Resolution                                                                                |
| :------: | :--------- | :------------------------------------------------------------------ | :---------------------------------------------------------------------------------------- |
|  **P2**  | Playground | Code export snippet required manual model replacement               | Dynamic code generator now reflects active selected model and system prompt               |
|  **P2**  | API Keys   | First-run users lacked immediate quickstart snippet on key creation | Added cURL quickstart card directly to Overview and Playground pages                      |
|  **P3**  | Docs       | Model ID casing in examples                                         | Standardized all canonical model identifiers to lowercase (`growx/fast`, `openai/gpt-4o`) |
