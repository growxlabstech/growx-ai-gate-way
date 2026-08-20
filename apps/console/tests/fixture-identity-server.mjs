import { createServer } from "node:http";

const port = 4100;
const user = { id: "usr_fixture", name: "Avery Lin", email: "avery@northstar.example", avatarUrl: null };
const organizations = [
  { organizationId: "org_northstar", organizationName: "Northstar Labs", organizationSlug: "northstar", status: "active" },
  { organizationId: "org_orbit", organizationName: "Orbit Systems", organizationSlug: "orbit", status: "active" },
];
const workspaces = [
  { workspaceId: "ws_production", workspaceName: "Production Gateway", workspaceSlug: "production", organizationId: "org_northstar", status: "active" },
  { workspaceId: "ws_staging", workspaceName: "Staging Gateway", workspaceSlug: "staging", organizationId: "org_northstar", status: "active" },
  { workspaceId: "ws_orbit", workspaceName: "Orbit Core", workspaceSlug: "core", organizationId: "org_orbit", status: "active" },
];
const challenges = new Map();

function send(response, status, body, headers = {}) {
  response.writeHead(status, { "content-type": "application/json", ...headers });
  response.end(JSON.stringify(body));
}

createServer((request, response) => {
  const cookie = request.headers.cookie ?? "";
  const tenantB = cookie.includes("gx_fixture=tenant-b");
  const newUser = cookie.includes("gx_fixture=d3-new");
  const authenticated = cookie.includes("gx_fixture=") || request.headers["x-d2-fixture"] === "tenant-a";
  if (request.url === "/health") return send(response, 200, { status: "ok" });
  if (request.url === "/v1/auth/d2-session") {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8", "set-cookie": "gx_fixture=tenant-a; Path=/; HttpOnly; SameSite=Lax" });
    return response.end("<!doctype html><title>D2 preview session ready</title><p>D2 preview session ready.</p>");
  }
  if (request.url === "/v1/auth/get-session") return authenticated ? send(response, 200, { session: { id: "ses_fixture" }, user: newUser ? { ...user, id: "usr_new", email: "new.user@example.com", name: "" } : user }) : send(response, 401, { error: "Authentication required" });
  if (request.url === "/v1/auth/context" && request.method === "POST") {
    if (!authenticated) return send(response, 401, { error: "Authentication required" });
    if (newUser) return send(response, 200, { user: { ...user, id: "usr_new", email: "new.user@example.com", name: "" }, sessionId: "ses_new", organizations: [], workspaces: [] });
    return send(response, 200, { user, sessionId: "ses_fixture", organizations: tenantB ? [organizations[1]] : organizations, workspaces: tenantB ? [workspaces[2]] : workspaces });
  }
  if (request.url === "/v1/auth/email-otp/send-verification-otp" && request.method === "POST") {
    let body = "";
    request.on("data", (chunk) => { body += chunk; });
    return request.on("end", () => {
      const { email } = JSON.parse(body || "{}");
      if (email === "rate.limit@example.com") return send(response, 429, { code: "RATE_LIMITED" }, { "retry-after": "42" });
      challenges.set(email, true);
      return send(response, 200, { success: true });
    });
  }
  if (request.url === "/v1/auth/sign-in/email-otp" && request.method === "POST") {
    let body = "";
    request.on("data", (chunk) => { body += chunk; });
    return request.on("end", () => {
      const { email, otp } = JSON.parse(body || "{}");
      if (!challenges.has(email)) return send(response, 400, { code: "OTP_EXPIRED" });
      if (otp === "000000") return send(response, 400, { code: "OTP_EXPIRED" });
      const expected = email === "new.user@example.com" ? "222222" : "111111";
      if (otp !== expected) return send(response, 400, { code: "INVALID_OTP" });
      challenges.delete(email);
      const fixture = email === "new.user@example.com" ? "d3-new" : "tenant-a";
      return send(response, 200, { user: email === "new.user@example.com" ? { ...user, email, id: "usr_new" } : user }, { "set-cookie": `gx_fixture=${fixture}; Path=/; HttpOnly; SameSite=Lax` });
    });
  }
  if (request.url === "/v1/auth/sign-in/social" && request.method === "POST") return send(response, 400, { code: "PROVIDER_NOT_CONFIGURED" });
  if (request.url === "/v1/auth/sign-out" && request.method === "POST") return send(response, 200, { success: true }, { "set-cookie": "gx_fixture=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax" });
  return send(response, 404, { error: "Not found" });
}).listen(port, "127.0.0.1");
