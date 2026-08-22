import { NextResponse } from "next/server";
import { loadTenantContext } from "../../../../../../lib/load-tenant-context";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await params;
  const tenant = await loadTenantContext();
  if (tenant.status !== "ready") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ws = tenant.context.workspaces.find(
    (w) => w.workspaceId === workspaceId,
  );
  if (!ws) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        error: {
          message: "Invalid JSON request payload",
          code: "invalid_request",
        },
      },
      { status: 400 },
    );
  }

  const {
    model,
    messages,
    temperature,
    max_tokens,
    top_p,
    stream = true,
    tools,
    response_format,
    seed,
    stop,
    reasoning_effort,
  } = body;

  if (!model || typeof model !== "string") {
    return NextResponse.json(
      {
        error: {
          message: "Model is required",
          code: "invalid_request_parameter",
        },
      },
      { status: 400 },
    );
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json(
      {
        error: {
          message: "Messages array cannot be empty",
          code: "invalid_request_parameter",
        },
      },
      { status: 400 },
    );
  }

  // Model-specific checks (e.g. disabled enterprise models without entitlement)
  if (
    model === "enterprise/custom-finetuned" &&
    ws.workspaceSlug !== "enterprise"
  ) {
    return NextResponse.json(
      {
        error: {
          type: "policy_denial_error",
          code: "model_not_entitled",
          message:
            "Workspace is not entitled to use enterprise fine-tuned models. Requires Enterprise plan.",
        },
      },
      { status: 403 },
    );
  }

  const identityServiceUrl =
    process.env.IDENTITY_SERVICE_URL ?? "http://127.0.0.1:4000";
  const gatewayUrl = process.env.GATEWAY_SERVICE_URL ?? identityServiceUrl;
  const cookieHeader = request.headers.get("cookie") ?? "";

  const payload: any = {
    model,
    messages: messages.map((m: any) => ({
      role: m.role,
      content: m.content,
    })),
    stream: Boolean(stream),
  };

  if (typeof temperature === "number") payload.temperature = temperature;
  if (typeof max_tokens === "number") payload.max_tokens = max_tokens;
  if (typeof top_p === "number") payload.top_p = top_p;
  if (typeof seed === "number") payload.seed = seed;
  if (Array.isArray(stop) && stop.length > 0) payload.stop = stop;
  if (reasoning_effort) payload.reasoning_effort = reasoning_effort;
  if (Array.isArray(tools) && tools.length > 0) payload.tools = tools;
  if (response_format) payload.response_format = response_format;

  try {
    const upstreamRes = await fetch(`${gatewayUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: cookieHeader,
        "x-organization-id": ws.organizationId,
        "x-workspace-id": ws.workspaceId,
      },
      body: JSON.stringify(payload),
      signal: request.signal,
    });

    if (!upstreamRes.ok) {
      const errJson = await upstreamRes.json().catch(() => ({
        error: {
          message: `Gateway error: ${upstreamRes.statusText}`,
          code: "gateway_error",
        },
      }));
      return NextResponse.json(errJson, { status: upstreamRes.status });
    }

    if (stream) {
      // Pipe the SSE stream back to the client directly
      const headers = new Headers();
      headers.set("content-type", "text/event-stream");
      headers.set("cache-control", "no-cache, no-transform");
      headers.set("connection", "keep-alive");

      const reqId =
        upstreamRes.headers.get("x-request-id") ??
        `req_${Math.random().toString(36).slice(2, 11)}`;
      headers.set("x-request-id", reqId);

      if (upstreamRes.headers.get("x-growx-latency")) {
        headers.set(
          "x-growx-latency",
          upstreamRes.headers.get("x-growx-latency")!,
        );
      }
      if (upstreamRes.headers.get("x-growx-ttft")) {
        headers.set("x-growx-ttft", upstreamRes.headers.get("x-growx-ttft")!);
      }

      return new Response(upstreamRes.body, {
        status: 200,
        headers,
      });
    } else {
      const data = await upstreamRes.json();
      return NextResponse.json(data, {
        status: 200,
        headers: {
          "x-request-id":
            upstreamRes.headers.get("x-request-id") ??
            `req_${Math.random().toString(36).slice(2, 11)}`,
        },
      });
    }
  } catch (err: any) {
    if (err.name === "AbortError" || request.signal.aborted) {
      return new Response(null, { status: 499 });
    }

    return NextResponse.json(
      {
        error: {
          type: "gateway_connection_error",
          code: "gateway_unavailable",
          message: err.message ?? "Unable to connect to GrowX Gateway service",
        },
      },
      { status: 502 },
    );
  }
}
