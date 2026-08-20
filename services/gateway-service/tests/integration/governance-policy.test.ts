import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import { createTestGatewayFixture, type TestGatewayFixture } from "../helpers/test-fixture.js";

describe("Phase 12 — Policy Engine & Governance End-to-End Tests", () => {
  let fixture: TestGatewayFixture;
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    fixture = await createTestGatewayFixture();
    server = fixture.server;
    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const address = server.address() as { port: number };
        baseUrl = `http://localhost:${address.port}`;
        resolve();
      });
    });
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("1. enforces workspace model policy denial with 0 provider executions and 403 status", async () => {
    const { rawKey, record } = await fixture.createTestApiKey();

    // Create workspace policy denying openai/gpt-4o-mini
    await fixture.gatewayEngine.policyEngine.createPolicy(
      {
        scopeType: "workspace",
        scopeId: record.workspaceId,
        name: "Prohibit GPT-4o-mini",
        createdBy: "usr_admin",
        definition: {
          rules: [
            {
              target: "model",
              effect: "deny",
              operator: "equals",
              value: "openai/gpt-4o-mini",
            },
          ],
        },
      },
      "usr_admin"
    );

    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${rawKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini",
        messages: [{ role: "user", content: "hello" }],
      }),
    });

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("model_not_allowed");
    expect(body.error.message).toContain("explicitly denied by governance policy");
    expect(fixture.mockAdapter.calls).toHaveLength(0);
  });

  it("2. enforces tool governance: denies request with prohibited tool name with 0 provider calls", async () => {
    const { rawKey, record } = await fixture.createTestApiKey();

    // Prohibit tool 'execute_arbitrary_code'
    await fixture.gatewayEngine.policyEngine.createPolicy(
      {
        scopeType: "workspace",
        scopeId: record.workspaceId,
        name: "Prohibit Code Execution",
        createdBy: "usr_admin",
        definition: {
          rules: [
            {
              target: "tool_name",
              effect: "deny",
              operator: "equals",
              value: "execute_arbitrary_code",
            },
          ],
        },
      },
      "usr_admin"
    );

    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${rawKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini",
        messages: [{ role: "user", content: "execute this code" }],
        tools: [
          {
            type: "function",
            name: "execute_arbitrary_code",
            description: "Runs code",
            parameters: {},
          },
        ],
      }),
    });

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("policy_denied");
    expect(body.error.message).toContain("Tool 'execute_arbitrary_code' is explicitly denied by tool policy");
    expect(fixture.mockAdapter.calls).toHaveLength(0);
  });

  it("3. enforces max tool count restriction", async () => {
    const { rawKey, record } = await fixture.createTestApiKey();

    // Restrict max tools to 1
    await fixture.gatewayEngine.policyEngine.createPolicy(
      {
        scopeType: "workspace",
        scopeId: record.workspaceId,
        name: "Max 1 Tool",
        createdBy: "usr_admin",
        definition: {
          rules: [
            {
              target: "max_tools",
              effect: "allow",
              operator: "less_than_or_equal",
              value: 1,
            },
          ],
        },
      },
      "usr_admin"
    );

    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${rawKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini",
        messages: [{ role: "user", content: "use tools" }],
        tools: [
          { type: "function", name: "tool1", parameters: {} },
          { type: "function", name: "tool2", parameters: {} },
        ],
      }),
    });

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("policy_denied");
    expect(body.error.message).toContain("exceeds the maximum allowed tool count of 1");
    expect(fixture.mockAdapter.calls).toHaveLength(0);
  });

  it("4. enforces max output token ceilings", async () => {
    const { rawKey, record } = await fixture.createTestApiKey();

    await fixture.gatewayEngine.policyEngine.createPolicy(
      {
        scopeType: "workspace",
        scopeId: record.workspaceId,
        name: "Max 500 Output Tokens",
        createdBy: "usr_admin",
        definition: {
          rules: [
            {
              target: "max_output_tokens",
              effect: "allow",
              operator: "less_than_or_equal",
              value: 500,
            },
          ],
        },
      },
      "usr_admin"
    );

    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${rawKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini",
        messages: [{ role: "user", content: "generate long response" }],
        max_tokens: 1500,
      }),
    });

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("policy_denied");
    expect(body.error.message).toContain("exceeds workspace policy ceiling of 500");
    expect(fixture.mockAdapter.calls).toHaveLength(0);
  });

  it("5. supports internal policy management endpoints: CRUD, versions, activation, effective policy, simulation", async () => {
    // 1. Create a policy via POST /internal/policies
    const createRes = await fetch(`${baseUrl}/internal/policies`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scopeType: "organization",
        scopeId: "org_finance",
        name: "Finance Org Policy",
        definition: {
          rules: [
            {
              target: "provider",
              effect: "allow",
              operator: "in",
              value: ["openai"],
            },
          ],
        },
      }),
    });

    expect(createRes.status).toBe(201);
    const createBody = await createRes.json();
    expect(createBody.success).toBe(true);
    expect(createBody.policy.name).toBe("Finance Org Policy");
    const policyId = createBody.policy.id;

    // 2. Fetch policy via GET /internal/policies/:id
    const getRes = await fetch(`${baseUrl}/internal/policies/${policyId}`);
    expect(getRes.status).toBe(200);
    const getBody = await getRes.json();
    expect(getBody.policy.id).toBe(policyId);
    expect(getBody.activeVersion.version).toBe(1);

    // 3. Create new version via POST /internal/policies/:id/versions
    const versionRes = await fetch(`${baseUrl}/internal/policies/${policyId}/versions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        definition: {
          rules: [
            {
              target: "provider",
              effect: "allow",
              operator: "in",
              value: ["openai", "anthropic"],
            },
          ],
        },
      }),
    });
    expect(versionRes.status).toBe(201);
    const versionBody = await versionRes.json();
    expect(versionBody.version.version).toBe(2);

    // 4. Activate version 2 via POST /internal/policies/:id/activate
    const activateRes = await fetch(`${baseUrl}/internal/policies/${policyId}/activate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ versionNumber: 2 }),
    });
    expect(activateRes.status).toBe(200);
    const activateBody = await activateRes.json();
    expect(activateBody.policy.activeVersion).toBe(2);

    // 5. Inspect effective policy via GET /internal/policies/effective
    const effRes = await fetch(
      `${baseUrl}/internal/policies/effective?organizationId=org_finance&workspaceId=ws_fin_1`
    );
    expect(effRes.status).toBe(200);
    const effBody = await effRes.json();
    expect(effBody.effectivePolicy.constraints.allowedProviders).toEqual(["openai", "anthropic"]);

    // 6. Simulate policy via POST /internal/policies/simulate
    const simRes = await fetch(`${baseUrl}/internal/policies/simulate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        context: {
          organizationId: "org_finance",
          workspaceId: "ws_fin_1",
          requestedModel: "openai/gpt-4o-mini",
          canonicalModel: {
            id: "mod_1",
            canonicalId: "openai/gpt-4o-mini",
          },
        },
        candidates: [
          {
            routeId: "rt_1",
            providerId: "openai",
            providerModelId: "gpt-4o-mini",
          },
          {
            routeId: "rt_2",
            providerId: "google",
            providerModelId: "gemini-1.5-flash",
          },
        ],
      }),
    });

    expect(simRes.status).toBe(200);
    const simBody = await simRes.json();
    expect(simBody.requestDecision.allowed).toBe(true);
    expect(simBody.routeEvaluation.eligible).toHaveLength(1);
    expect(simBody.routeEvaluation.eligible[0].providerId).toBe("openai");
    expect(simBody.routeEvaluation.excluded).toHaveLength(1);
    expect(simBody.routeEvaluation.excluded[0].candidate.providerId).toBe("google");
  });
});
