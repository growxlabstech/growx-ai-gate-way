import { createServer } from "node:http";

const port = 4100;
const user = {
  id: "usr_fixture",
  name: "Avery Lin",
  email: "avery@northstar.example",
  avatarUrl: null,
};
const organizations = [
  {
    organizationId: "org_northstar",
    organizationName: "Northstar Labs",
    organizationSlug: "northstar",
    status: "active",
  },
  {
    organizationId: "org_orbit",
    organizationName: "Orbit Systems",
    organizationSlug: "orbit",
    status: "active",
  },
];
const workspaces = [
  {
    workspaceId: "ws_production",
    workspaceName: "Production Gateway",
    workspaceSlug: "production",
    organizationId: "org_northstar",
    status: "active",
  },
  {
    workspaceId: "ws_staging",
    workspaceName: "Staging Gateway",
    workspaceSlug: "staging",
    organizationId: "org_northstar",
    status: "active",
  },
  {
    workspaceId: "ws_orbit",
    workspaceName: "Orbit Core",
    workspaceSlug: "core",
    organizationId: "org_orbit",
    status: "active",
  },
];
const challenges = new Map();
let newUserReady = false;

function send(response, status, body, headers = {}) {
  response.writeHead(status, {
    "content-type": "application/json",
    ...headers,
  });
  response.end(JSON.stringify(body));
}

createServer((request, response) => {
  const cookie = request.headers.cookie ?? "";
  const tenantB = cookie.includes("gx_fixture=tenant-b");
  const newUser = cookie.includes("gx_fixture=d3-new");
  const authenticated =
    cookie.includes("gx_fixture=") ||
    request.headers["x-d2-fixture"] === "tenant-a";
  if (request.url === "/health") return send(response, 200, { status: "ok" });
  if (request.url === "/v1/auth/d2-session") {
    response.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "set-cookie": "gx_fixture=tenant-a; Path=/; HttpOnly; SameSite=Lax",
    });
    return response.end(
      "<!doctype html><title>D2 preview session ready</title><p>D2 preview session ready.</p>",
    );
  }
  if (request.url === "/v1/auth/get-session")
    return authenticated
      ? send(response, 200, {
          session: { id: "ses_fixture" },
          user: newUser
            ? {
                ...user,
                id: "usr_new",
                email: "new.user@example.com",
                name: "",
              }
            : user,
        })
      : send(response, 401, { error: "Authentication required" });
  if (request.url === "/v1/auth/context" && request.method === "POST") {
    if (!authenticated)
      return send(response, 401, { error: "Authentication required" });
    if (newUser && !newUserReady)
      return send(response, 200, {
        user: {
          ...user,
          id: "usr_new",
          email: "new.user@example.com",
          name: "",
        },
        sessionId: "ses_new",
        organizations: [],
        workspaces: [],
      });
    if (newUser)
      return send(response, 200, {
        user: {
          ...user,
          id: "usr_new",
          email: "new.user@example.com",
          name: "",
        },
        sessionId: "ses_new",
        organizations: [
          {
            organizationId: "org_acme",
            organizationName: "Acme Labs",
            organizationSlug: "acme-labs",
            status: "active",
          },
        ],
        workspaces: [
          {
            workspaceId: "ws_default",
            workspaceName: "Default Workspace",
            workspaceSlug: "default",
            organizationId: "org_acme",
            status: "active",
          },
        ],
      });
    return send(response, 200, {
      user,
      sessionId: "ses_fixture",
      organizations: tenantB ? [organizations[1]] : organizations,
      workspaces: tenantB ? [workspaces[2]] : workspaces,
    });
  }
  if (
    request.url === "/v1/auth/email-otp/send-verification-otp" &&
    request.method === "POST"
  ) {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    return request.on("end", () => {
      const { email } = JSON.parse(body || "{}");
      if (email === "rate.limit@example.com")
        return send(
          response,
          429,
          { code: "RATE_LIMITED" },
          { "retry-after": "42" },
        );
      challenges.set(email, true);
      return send(response, 200, { success: true });
    });
  }
  if (
    request.url === "/v1/auth/sign-in/email-otp" &&
    request.method === "POST"
  ) {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    return request.on("end", () => {
      const { email, otp } = JSON.parse(body || "{}");
      if (!challenges.has(email))
        return send(response, 400, { code: "OTP_EXPIRED" });
      if (otp === "000000") return send(response, 400, { code: "OTP_EXPIRED" });
      const expected = email === "new.user@example.com" ? "222222" : "111111";
      if (otp !== expected) return send(response, 400, { code: "INVALID_OTP" });
      challenges.delete(email);
      const fixture = email === "new.user@example.com" ? "d3-new" : "tenant-a";
      if (fixture === "d3-new") newUserReady = false;
      return send(
        response,
        200,
        {
          user:
            email === "new.user@example.com"
              ? { ...user, email, id: "usr_new" }
              : user,
        },
        {
          "set-cookie": `gx_fixture=${fixture}; Path=/; HttpOnly; SameSite=Lax`,
        },
      );
    });
  }
  if (
    request.url === "/v1/onboarding/organization" &&
    request.method === "POST"
  ) {
    if (!newUser)
      return send(response, 401, {
        error: {
          code: "AUTHENTICATION_REQUIRED",
          message: "Authentication required",
        },
      });
    newUserReady = true;
    return send(response, 201, {
      organizationId: "org_acme",
      organizationSlug: "acme-labs",
      workspaceId: "ws_default",
      workspaceSlug: "default",
      replayed: false,
    });
  }
  if (request.url === "/v1/invitations/accept" && request.method === "POST") {
    if (!authenticated)
      return send(response, 401, {
        error: {
          code: "AUTHENTICATION_REQUIRED",
          message: "Authentication required",
        },
      });
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    return request.on("end", () => {
      const { token } = JSON.parse(body || "{}");
      if (token !== "valid-invite-token-123")
        return send(response, 400, {
          error: {
            code: "INVITATION_INVALID",
            message: "This invitation is invalid or has already been used.",
          },
        });
      return send(response, 200, {
        organizationId: "org_northstar",
        organizationSlug: "northstar",
        workspaceId: "ws_production",
        workspaceSlug: "production",
      });
    });
  }
  if (request.url.startsWith("/v1/analytics/overview")) {
    const url = new URL(request.url, "http://127.0.0.1:4100");
    const workspaceId = url.searchParams.get("workspaceId");
    const isNew = workspaceId === "ws_default" || workspaceId === "ws_orbit";
    if (isNew) {
      return send(response, 200, {
        organizationId: "org_acme",
        organizationSlug: "acme-labs",
        workspaceId: "ws_default",
        workspaceSlug: "default",
        period: "24h",
        metrics: {
          totalRequests: 0,
          completedRequests: 0,
          failedRequests: 0,
          successRate: 0,
          errorRate: 0,
          totalTokens: "0",
          inputTokens: "0",
          outputTokens: "0",
          cachedTokens: "0",
          p50LatencyMs: 0,
          p95LatencyMs: 0,
          p99LatencyMs: 0,
          ttftMs: 0,
          activeKeysCount: 0,
        },
        financials: {
          availableBalance: "100.00",
          availableBalanceFormatted: "$100.00",
          totalSpend: "0.00",
          totalSpendFormatted: "$0.00",
          currency: "USD",
          currencySymbol: "$",
          walletStatus: "active",
          isLowBalance: false,
        },
        timeseries: [],
        topModels: [],
        recentRequests: [],
        isFirstRun: true,
        status: "ready",
      });
    }

    const now = Date.now();
    return send(response, 200, {
      organizationId: "org_northstar",
      organizationSlug: "northstar",
      workspaceId: "ws_production",
      workspaceSlug: "production",
      period: "24h",
      metrics: {
        totalRequests: 1280,
        completedRequests: 1272,
        failedRequests: 8,
        successRate: 99.38,
        errorRate: 0.62,
        totalTokens: "842000",
        inputTokens: "512000",
        outputTokens: "330000",
        cachedTokens: "125000",
        p50LatencyMs: 145,
        p95LatencyMs: 320,
        p99LatencyMs: 580,
        ttftMs: 85,
        activeKeysCount: 3,
      },
      financials: {
        availableBalance: "450.00",
        availableBalanceFormatted: "$450.00",
        totalSpend: "50.00",
        totalSpendFormatted: "$50.00",
        currency: "USD",
        currencySymbol: "$",
        walletStatus: "active",
        isLowBalance: false,
      },
      timeseries: [
        {
          timestamp: new Date(now - 10 * 2 * 3600 * 1000).toISOString(),
          label: "20h ago",
          requests: 85,
          errors: 0,
          tokens: 54000,
        },
        {
          timestamp: new Date(now - 8 * 2 * 3600 * 1000).toISOString(),
          label: "16h ago",
          requests: 120,
          errors: 1,
          tokens: 78000,
        },
        {
          timestamp: new Date(now - 6 * 2 * 3600 * 1000).toISOString(),
          label: "12h ago",
          requests: 140,
          errors: 0,
          tokens: 92000,
        },
        {
          timestamp: new Date(now - 4 * 2 * 3600 * 1000).toISOString(),
          label: "8h ago",
          requests: 210,
          errors: 2,
          tokens: 140000,
        },
        {
          timestamp: new Date(now - 2 * 2 * 3600 * 1000).toISOString(),
          label: "4h ago",
          requests: 310,
          errors: 3,
          tokens: 205000,
        },
        {
          timestamp: new Date(now - 30 * 60 * 1000).toISOString(),
          label: "Now",
          requests: 415,
          errors: 2,
          tokens: 273000,
        },
      ],
      topModels: [
        {
          modelId: "openai/gpt-4o",
          displayName: "GPT-4o",
          provider: "OpenAI",
          requests: 780,
          totalTokens: 520000,
          share: 60.9,
          successRate: 99.6,
        },
        {
          modelId: "anthropic/claude-3-5-sonnet",
          displayName: "Claude 3.5 Sonnet",
          provider: "Anthropic",
          requests: 350,
          totalTokens: 210000,
          share: 27.3,
          successRate: 99.1,
        },
        {
          modelId: "growx/fast",
          displayName: "GrowX Fast Router",
          provider: "GrowX",
          requests: 150,
          totalTokens: 112000,
          share: 11.8,
          successRate: 98.7,
        },
      ],
      recentRequests: [
        {
          id: "req_01jq8a9x71",
          timestamp: new Date(now - 45 * 1000).toISOString(),
          relativeTime: "45s ago",
          modelId: "openai/gpt-4o",
          status: "succeeded",
          durationMs: 185,
          totalTokens: 620,
          costFormatted: "$0.0031",
        },
        {
          id: "req_01jq8a8b12",
          timestamp: new Date(now - 2 * 60 * 1000).toISOString(),
          relativeTime: "2m ago",
          modelId: "anthropic/claude-3-5-sonnet",
          status: "succeeded",
          durationMs: 240,
          totalTokens: 1150,
          costFormatted: "$0.0058",
        },
        {
          id: "req_01jq8a7f43",
          timestamp: new Date(now - 5 * 60 * 1000).toISOString(),
          relativeTime: "5m ago",
          modelId: "growx/fast",
          status: "succeeded",
          durationMs: 95,
          totalTokens: 340,
          costFormatted: "$0.0008",
        },
        {
          id: "req_01jq8a5e89",
          timestamp: new Date(now - 12 * 60 * 1000).toISOString(),
          relativeTime: "12m ago",
          modelId: "openai/gpt-4o",
          status: "failed",
          durationMs: 450,
          totalTokens: 0,
          costFormatted: "$0.0000",
        },
        {
          id: "req_01jq8a3d02",
          timestamp: new Date(now - 18 * 60 * 1000).toISOString(),
          relativeTime: "18m ago",
          modelId: "openai/gpt-4o",
          status: "succeeded",
          durationMs: 160,
          totalTokens: 580,
          costFormatted: "$0.0029",
        },
      ],
      isFirstRun: false,
      status: "ready",
    });
  }
  if (
    request.url.startsWith("/v1/organizations/") &&
    request.url.includes("/api-keys")
  ) {
    const url = new URL(request.url, "http://127.0.0.1:4100");
    const parts = url.pathname.split("/");
    const orgId = parts[3];
    const wsId = parts[5];
    const keyId = parts[7];
    const isRotate = parts[8] === "rotate";

    // Handle single key revoke
    if (request.method === "DELETE" && keyId) {
      return send(response, 200, {
        success: true,
        data: {
          id: keyId,
          organizationId: orgId,
          workspaceId: wsId,
          environmentId: "env_production",
          environment: "production",
          name: "Revoked API Key",
          prefix: `gx_live_${keyId}_••••••••••••`,
          maskedKey: `gx_live_${keyId}_••••••••••••`,
          status: "revoked",
          permissions: ["models.read", "responses.create"],
          createdBy: "usr_fixture",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          expiresAt: null,
          lastUsedAt: null,
          revokedAt: new Date().toISOString(),
          revokedBy: "usr_fixture",
        },
      });
    }

    // Handle single key rotate
    if (request.method === "POST" && isRotate) {
      const newId = `key_${Math.random().toString(16).slice(2, 10)}${Math.random().toString(16).slice(2, 10)}`;
      const fullSecret = `gx_live_${newId}_rotatesecretpart123456789`;
      return send(response, 200, {
        apiKey: {
          id: newId,
          organizationId: orgId,
          workspaceId: wsId,
          environmentId: "env_production",
          environment: "production",
          name: "Rotated API Key",
          prefix: `gx_live_${newId}_••••••••••••`,
          maskedKey: `gx_live_${newId}_••••••••••••`,
          status: "active",
          permissions: ["models.read", "responses.create"],
          createdBy: "usr_fixture",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          expiresAt: null,
          lastUsedAt: null,
          revokedAt: null,
          revokedBy: null,
        },
        secret: fullSecret,
        oldApiKey: {
          id: keyId,
          status: "revoked",
        },
      });
    }

    // Handle create key
    if (request.method === "POST") {
      let body = "";
      request.on("data", (chunk) => {
        body += chunk;
      });
      return request.on("end", () => {
        const input = JSON.parse(body || "{}");
        const newId = `key_${Math.random().toString(16).slice(2, 10)}${Math.random().toString(16).slice(2, 10)}`;
        const env = input.environment ?? "production";
        const envPrefix = env === "production" ? "gx_live" : "gx_test";
        const fullSecret = `${envPrefix}_${newId}_mocksecretstring123456789`;

        return send(response, 201, {
          apiKey: {
            id: newId,
            organizationId: orgId,
            workspaceId: wsId,
            environmentId: `env_${env}`,
            environment: env,
            name: input.name ?? "API Key",
            prefix: `${envPrefix}_${newId}_••••••••••••`,
            maskedKey: `${envPrefix}_${newId}_••••••••••••`,
            status: "active",
            permissions: input.permissions ?? [
              "models.read",
              "responses.create",
            ],
            createdBy: "usr_fixture",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            expiresAt: input.expiresInDays
              ? new Date(
                  Date.now() + input.expiresInDays * 86400000,
                ).toISOString()
              : null,
            lastUsedAt: null,
            revokedAt: null,
            revokedBy: null,
          },
          secret: fullSecret,
        });
      });
    }

    // Handle list keys
    if (request.method === "GET") {
      if (wsId === "ws_default" || wsId === "ws_orbit") {
        return send(response, 200, {
          data: [],
          pagination: { hasMore: false },
        });
      }

      return send(response, 200, {
        data: [
          {
            id: "key_01jq8a9xprod0001",
            organizationId: orgId,
            workspaceId: wsId,
            environmentId: "env_production",
            environment: "production",
            name: "Production Backend API",
            prefix: "gx_live_key_01jq8a9xprod0001_••••••••••••",
            maskedKey: "gx_live_key_01jq8a9xprod0001_••••••••••••",
            status: "active",
            permissions: [
              "models.read",
              "responses.create",
              "embeddings.create",
            ],
            createdBy: "usr_fixture",
            createdAt: new Date(Date.now() - 14 * 86400000).toISOString(),
            updatedAt: new Date(Date.now() - 14 * 86400000).toISOString(),
            expiresAt: null,
            lastUsedAt: new Date(Date.now() - 120000).toISOString(),
            revokedAt: null,
            revokedBy: null,
          },
          {
            id: "key_01jq8a9xprod0002",
            organizationId: orgId,
            workspaceId: wsId,
            environmentId: "env_production",
            environment: "production",
            name: "CI/CD Smoke Runner",
            prefix: "gx_live_key_01jq8a9xprod0002_••••••••••••",
            maskedKey: "gx_live_key_01jq8a9xprod0002_••••••••••••",
            status: "active",
            permissions: ["models.read", "responses.create"],
            createdBy: "usr_fixture",
            createdAt: new Date(Date.now() - 30 * 86400000).toISOString(),
            updatedAt: new Date(Date.now() - 30 * 86400000).toISOString(),
            expiresAt: new Date(Date.now() + 60 * 86400000).toISOString(),
            lastUsedAt: new Date(Date.now() - 14400000).toISOString(),
            revokedAt: null,
            revokedBy: null,
          },
          {
            id: "key_01jq8a9xprod0003",
            organizationId: orgId,
            workspaceId: wsId,
            environmentId: "env_production",
            environment: "production",
            name: "Legacy Pipeline v1 (Revoked)",
            prefix: "gx_live_key_01jq8a9xprod0003_••••••••••••",
            maskedKey: "gx_live_key_01jq8a9xprod0003_••••••••••••",
            status: "revoked",
            permissions: ["models.read", "responses.create"],
            createdBy: "usr_fixture",
            createdAt: new Date(Date.now() - 60 * 86400000).toISOString(),
            updatedAt: new Date(Date.now() - 5 * 86400000).toISOString(),
            expiresAt: null,
            lastUsedAt: new Date(Date.now() - 6 * 86400000).toISOString(),
            revokedAt: new Date(Date.now() - 5 * 86400000).toISOString(),
            revokedBy: "usr_fixture",
          },
        ],
        pagination: { hasMore: false },
      });
    }
  }

  // Gateway Chat Completions handler
  if (request.url === "/v1/chat/completions" && request.method === "POST") {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    return request.on("end", () => {
      let parsed = {};
      try {
        parsed = JSON.parse(body || "{}");
      } catch {
        return send(response, 400, {
          error: {
            message: "Invalid JSON request body",
            code: "invalid_request",
          },
        });
      }

      const {
        model,
        messages = [],
        stream = true,
        tools,
        response_format,
        temperature,
        max_tokens,
      } = parsed;
      const userContent = messages
        .map((m) =>
          typeof m.content === "string" ? m.content : JSON.stringify(m.content),
        )
        .join(" ");

      // Controlled error injection
      if (model === "invalid-model-error") {
        return send(response, 400, {
          error: {
            type: "invalid_request_error",
            code: "model_not_found",
            message: "The model 'invalid-model-error' does not exist.",
          },
        });
      }

      if (userContent.includes("rate_limit_error")) {
        return send(
          response,
          429,
          {
            error: {
              type: "rate_limit_error",
              code: "rate_limit_exceeded",
              message:
                "Rate limit exceeded for workspace. Please retry after backoff.",
            },
          },
          { "retry-after": "5" },
        );
      }

      if (userContent.includes("insufficient_credits_error")) {
        return send(response, 402, {
          error: {
            type: "billing_error",
            code: "insufficient_quota",
            message:
              "Insufficient workspace wallet credits to fulfill this generation request.",
          },
        });
      }

      const reqId = `req_${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 6)}`;
      const nowTs = Math.floor(Date.now() / 1000);

      // Non-streaming response
      if (!stream) {
        let content = `GrowX Gateway executed request for model ${model}.`;
        if (
          response_format?.type === "json_object" ||
          response_format?.type === "json_schema"
        ) {
          content = JSON.stringify(
            {
              status: "success",
              model,
              structured: true,
              timestamp: new Date().toISOString(),
            },
            null,
            2,
          );
        }

        return send(
          response,
          200,
          {
            id: reqId,
            object: "chat.completion",
            created: nowTs,
            model,
            choices: [
              {
                index: 0,
                message: {
                  role: "assistant",
                  content,
                },
                finish_reason: "stop",
              },
            ],
            usage: {
              prompt_tokens: 16,
              completion_tokens: 24,
              total_tokens: 40,
              cost: 0.00012,
            },
          },
          {
            "x-request-id": reqId,
            "x-growx-ttft": "35",
            "x-growx-latency": "95",
          },
        );
      }

      // Streaming response (SSE)
      response.writeHead(200, {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        "x-request-id": reqId,
        "x-growx-ttft": "42",
        "x-growx-latency": "115",
      });
      if (typeof response.flushHeaders === "function") response.flushHeaders();

      // Cancellation check
      let isAborted = false;
      request.on("close", () => {
        isAborted = true;
      });

      // Prepare chunks based on tool call, structured output, or standard text
      const chunks = [];

      if (Array.isArray(tools) && tools.length > 0) {
        const toolName = tools[0]?.function?.name || "get_current_weather";
        chunks.push(
          `data: ${JSON.stringify({ id: reqId, object: "chat.completion.chunk", created: nowTs, model, choices: [{ index: 0, delta: { role: "assistant", tool_calls: [{ index: 0, id: `call_${Math.random().toString(36).slice(2, 8)}`, type: "function", function: { name: toolName, arguments: '{"' } }] } }] })}\n\n`,
          `data: ${JSON.stringify({ id: reqId, object: "chat.completion.chunk", created: nowTs, model, choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: 'location": "San Francisco, CA", "unit": "celsius"}' } }] } }] })}\n\n`,
          `data: ${JSON.stringify({ id: reqId, object: "chat.completion.chunk", created: nowTs, model, choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }], usage: { prompt_tokens: 45, completion_tokens: 28, total_tokens: 73, cost: 0.00022 } })}\n\n`,
          "data: [DONE]\n\n",
        );
      } else if (
        response_format?.type === "json_object" ||
        response_format?.type === "json_schema"
      ) {
        chunks.push(
          `data: ${JSON.stringify({ id: reqId, object: "chat.completion.chunk", created: nowTs, model, choices: [{ index: 0, delta: { role: "assistant", content: '{\n  "status": "completed",\n' } }] })}\n\n`,
          `data: ${JSON.stringify({ id: reqId, object: "chat.completion.chunk", created: nowTs, model, choices: [{ index: 0, delta: { content: '  "model": "' + model + '",\n  "verified": true\n}' } }] })}\n\n`,
          `data: ${JSON.stringify({ id: reqId, object: "chat.completion.chunk", created: nowTs, model, choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 22, completion_tokens: 20, total_tokens: 42, cost: 0.00014 } })}\n\n`,
          "data: [DONE]\n\n",
        );
      } else {
        chunks.push(
          `data: ${JSON.stringify({ id: reqId, object: "chat.completion.chunk", created: nowTs, model, choices: [{ index: 0, delta: { role: "assistant", content: "GrowX AI Gateway successfully routed this request " } }] })}\n\n`,
          `data: ${JSON.stringify({ id: reqId, object: "chat.completion.chunk", created: nowTs, model, choices: [{ index: 0, delta: { content: "to " + model + ".\n\n" } }] })}\n\n`,
          `data: ${JSON.stringify({ id: reqId, object: "chat.completion.chunk", created: nowTs, model, choices: [{ index: 0, delta: { content: "Execution metadata verified: streaming active, zero token leaks." } }] })}\n\n`,
          `data: ${JSON.stringify({ id: reqId, object: "chat.completion.chunk", created: nowTs, model, choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 18, completion_tokens: 32, total_tokens: 50, cost: 0.00015 } })}\n\n`,
          "data: [DONE]\n\n",
        );
      }

      const isSlowStream =
        Array.isArray(messages) &&
        messages.some(
          (m) =>
            typeof m?.content === "string" &&
            (m.content.includes("essay") || m.content.includes("long")),
        );

      if (isSlowStream) {
        let chunkIdx = 0;
        function sendNextSlowChunk() {
          if (isAborted || response.writableEnded) return;
          if (chunkIdx < chunks.length) {
            response.write(chunks[chunkIdx]);
            chunkIdx++;
            setTimeout(sendNextSlowChunk, 150);
          } else {
            response.end();
          }
        }
        sendNextSlowChunk();
      } else {
        for (const chunk of chunks) {
          if (isAborted || response.writableEnded) break;
          response.write(chunk);
        }
        response.end();
      }
    });
  }

  if (request.url === "/v1/auth/sign-in/social" && request.method === "POST")
    return send(response, 400, { code: "PROVIDER_NOT_CONFIGURED" });
  if (request.url === "/v1/auth/sign-out" && request.method === "POST")
    return send(
      response,
      200,
      { success: true },
      {
        "set-cookie": "gx_fixture=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax",
      },
    );
  return send(response, 404, { error: "Not found" });
}).listen(port, "127.0.0.1");
