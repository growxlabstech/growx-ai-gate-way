import { describe, expect, it, beforeEach } from "vitest";
import { RoutingEngineV2 } from "../src/application/routing-engine-v2.js";
import { RoutingSimulationService } from "../src/application/simulation-service.js";
import { PolicyManagementService } from "../src/application/policy-management-service.js";
import { RouteManagementService } from "../src/application/route-management-service.js";
import { buildRequestCapabilityProfile } from "@growx/routing";
import type {
  CanonicalModelEntity,
  ProviderRouteEntity,
} from "@growx/model-registry-service";

describe("Routing Engine V2 - Service Integration", () => {
  let mockModelRegistry: any;
  let mockProviderService: any;
  let routerV2: RoutingEngineV2;
  let simulationService: RoutingSimulationService;
  let policyService: PolicyManagementService;
  let routeService: RouteManagementService;

  const sampleModel: CanonicalModelEntity = {
    id: "mod_gpt4",
    canonicalId: "growx/fast",
    displayName: "GrowX Fast",
    family: "gpt",
    capabilities: ["streaming", "tools.call", "text.reason"],
    inputModalities: ["text"],
    outputModalities: ["text"],
    contextWindow: 128000,
    maxOutputTokens: 4096,
    status: "active",
    routingEligible: true,
    customerVisible: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any;

  const sampleRoutes: ProviderRouteEntity[] = [
    {
      id: "route_openai",
      modelId: "mod_gpt4",
      canonicalModelId: "growx/fast",
      providerId: "openai",
      providerModelId: "gpt-4o",
      region: "us-east-1",
      priority: 10,
      status: "active",
      routingEligible: true,
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: "route_anthropic",
      modelId: "mod_gpt4",
      canonicalModelId: "growx/fast",
      providerId: "anthropic",
      providerModelId: "claude-3-5-sonnet",
      region: "ap-south-1",
      priority: 20,
      status: "active",
      routingEligible: true,
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  beforeEach(() => {
    mockModelRegistry = {
      repository: {
        listModels: async () => ({ items: [sampleModel] }),
        listRoutes: async () => sampleRoutes,
      },
    };
    mockProviderService = {
      listProviders: async () => [
        { id: "openai", enabled: true, status: "active" },
        { id: "anthropic", enabled: true, status: "active" },
      ],
      listCredentials: async (pId: string) => [
        { id: `cred_${pId}`, status: "active" },
      ],
    };

    routerV2 = new RoutingEngineV2(mockModelRegistry, mockProviderService);
    simulationService = new RoutingSimulationService(routerV2);
    policyService = new PolicyManagementService(routerV2.snapshotService);
    routeService = new RouteManagementService(routerV2.snapshotService);
  });

  it("routes request to top ranked route under default balanced objective", async () => {
    const authContext: any = {
      organizationId: "org_1",
      workspaceId: "ws_1",
      apiKeyId: "key_1",
    };

    const result = await routerV2.route({
      requestId: "req_test_1",
      auth: authContext,
      resolvedModel: {
        model: sampleModel,
        eligibleConfiguredRoutes: sampleRoutes,
        canonicalModelId: "growx/fast",
        requestedModelId: "growx/fast",
      } as any,
      requiredCapabilities: ["streaming"],
      stream: true,
    });

    expect(result.decision.selectedRouteId).toBeDefined();
    expect(result.plan.fallbacks.length).toBe(1);
    expect(result.plan.requestProfileHash).toBeDefined();
  });

  it("filters routes by data residency requirement", async () => {
    const authContext: any = {
      organizationId: "org_1",
      workspaceId: "ws_1",
      apiKeyId: "key_1",
    };

    const result = await routerV2.route({
      requestId: "req_test_residency",
      auth: authContext,
      resolvedModel: {
        model: sampleModel,
        eligibleConfiguredRoutes: sampleRoutes,
        canonicalModelId: "growx/fast",
        requestedModelId: "growx/fast",
      } as any,
      requiredCapabilities: ["streaming"],
      dataResidencyRequirement: "india",
      constraints: {
        dataResidency: "india",
      },
    });

    expect(result.decision.selectedRouteId).toBe("route_anthropic");
    expect(result.selectedRoute.region).toBe("ap-south-1");
  });

  it("simulates routing decisions without performing provider requests", async () => {
    const profile = buildRequestCapabilityProfile({
      canonicalModelId: "growx/fast",
      streaming: true,
    });

    const simResult = await simulationService.simulate({
      profile,
      objective: "lowest_latency",
    });

    expect(simResult.totalCandidatesConsidered).toBe(2);
    expect(simResult.eligibleCandidatesCount).toBe(2);
    expect(simResult.selectedRouteId).toBeDefined();
    expect(simResult.fallbackChain.length).toBe(1);
  });

  it("creates, activates, and retires versioned routing policies", async () => {
    const auth: any = {
      organizationId: "org_1",
      workspaceId: "ws_1",
      apiKeyId: "key_admin",
    };

    const policy = await policyService.createPolicy(auth, {
      name: "Cost Optimized Policy",
      objective: "lowest_cost",
    });

    expect(policy.id).toBeDefined();
    expect(policy.objective).toBe("lowest_cost");
    expect(policy.status).toBe("active");

    const retired = await policyService.retirePolicy(auth, policy.id);
    expect(retired.status).toBe("retired");
  });

  it("handles route draining and kill-switch disables", async () => {
    const auth: any = {
      organizationId: "org_1",
      workspaceId: "ws_1",
      apiKeyId: "key_ops",
    };

    const disabledControl = await routeService.disableRoute(
      auth,
      "route_openai",
      "Emergency upstream failure",
    );
    expect(disabledControl.disabled).toBe(true);
    expect(disabledControl.mode).toBe("disabled");

    // Route again, openai should be excluded
    const result = await routerV2.route({
      requestId: "req_after_killswitch",
      auth,
      resolvedModel: {
        model: sampleModel,
        eligibleConfiguredRoutes: sampleRoutes,
        canonicalModelId: "growx/fast",
        requestedModelId: "growx/fast",
      } as any,
      requiredCapabilities: ["streaming"],
    });

    expect(result.decision.selectedRouteId).toBe("route_anthropic");
  });
});
