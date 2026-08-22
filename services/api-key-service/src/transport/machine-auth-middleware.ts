import type { IncomingMessage, ServerResponse } from "node:http";
import type { ApiKeyService } from "../application/api-key-service.js";
import type {
  ApiKeyScope,
  MachineAuthContext,
  DenialCode,
} from "../domain/types.js";

export function extractClientIp(req: IncomingMessage): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  if (Array.isArray(forwarded) && forwarded[0]) {
    return forwarded[0].trim();
  }
  return req.socket.remoteAddress ?? "127.0.0.1";
}

export function hasApiKeyInQuery(urlStr: string): boolean {
  if (!urlStr || !urlStr.includes("?")) return false;
  const query = urlStr.slice(urlStr.indexOf("?") + 1).toLowerCase();
  return (
    query.includes("api_key=") ||
    query.includes("apikey=") ||
    query.includes("access_token=") ||
    query.includes("key=")
  );
}

export function formatGatewayError(code: DenialCode, requestId: string) {
  const isAuth = [
    "missing_api_key",
    "invalid_api_key",
    "expired_api_key",
    "revoked_api_key",
  ].includes(code);
  const type = isAuth
    ? "authentication_error"
    : code.endsWith("exceeded")
      ? "limit_error"
      : "authorization_error";

  return {
    error: {
      type,
      code,
      message: code.replaceAll("_", " "),
      requestId,
    },
  };
}

export interface MachineAuthOptions {
  permission?: ApiKeyScope | undefined;
  model?: string | undefined;
}

export async function machineAuthMiddleware(
  req: IncomingMessage,
  res: ServerResponse,
  apiKeyService: ApiKeyService,
  options?: MachineAuthOptions,
): Promise<MachineAuthContext | null> {
  const requestId =
    (req.headers["x-request-id"] as string) ??
    `req_${crypto.randomUUID().replace(/-/g, "")}`;

  if (hasApiKeyInQuery(req.url ?? "")) {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify(formatGatewayError("invalid_api_key", requestId)));
    return null;
  }

  const authorization = req.headers["authorization"];
  const clientIp = extractClientIp(req);

  const decision = await apiKeyService.authenticate({
    authorization:
      typeof authorization === "string" ? authorization : undefined,
    clientIp,
    permission: options?.permission,
    model: options?.model,
  });

  if (!decision.allowed) {
    res.writeHead(decision.status, { "content-type": "application/json" });
    res.end(JSON.stringify(formatGatewayError(decision.code, requestId)));
    return null;
  }

  apiKeyService.recordLastUsed(decision.context.apiKeyId);

  return decision.context;
}
