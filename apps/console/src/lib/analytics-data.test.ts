import { describe, expect, it } from "vitest";
import {
  loadWorkspaceApiKeyBreakdown,
  loadWorkspaceErrorTaxonomy,
  loadWorkspaceModelBreakdown,
  loadWorkspaceRequestDetail,
  loadWorkspaceRequestHistory,
  loadWorkspaceTimeSeries,
  loadWorkspaceUsageAnalytics,
} from "./analytics-data";

describe("D7 Analytics & Request Data Layer", () => {
  it("loads workspace usage summary with accurate request counts, tokens, latency and spend", async () => {
    const summary = await loadWorkspaceUsageAnalytics({
      organizationId: "org_northstar",
      workspaceId: "ws_production",
      timeRange: "24h",
    });

    expect(summary.requests.total).toBe(1280);
    expect(summary.requests.completed).toBe(1272);
    expect(summary.requests.failed).toBe(8);
    expect(summary.requests.successRate).toBe(99.38);
    expect(summary.tokens.totalTokens).toBe(842000);
    expect(summary.financials.totalCostFormatted).toBe("$50.00");
    expect(summary.latency.p95Ms).toBe(320);
    expect(summary.ttft.p50Ms).toBe(85);
  });

  it("loads timeseries points with latency percentiles and token volume", async () => {
    const series = await loadWorkspaceTimeSeries({
      organizationId: "org_northstar",
      workspaceId: "ws_production",
      timeRange: "24h",
    });

    expect(series.length).toBeGreaterThanOrEqual(6);
    expect(series[0].requestsTotal).toBe(85);
    expect(series[0].latencyP95Ms).toBe(290);
  });

  it("loads model breakdown with share percentages and authoritative cost", async () => {
    const models = await loadWorkspaceModelBreakdown({
      organizationId: "org_northstar",
      workspaceId: "ws_production",
      timeRange: "24h",
    });

    expect(models.length).toBe(3);
    expect(models[0].modelId).toBe("openai/gpt-4o");
    expect(models[0].sharePercentage).toBe(60.9);
    expect(models[0].costFormatted).toBe("$32.50");
  });

  it("filters request history by model and status", async () => {
    const all = await loadWorkspaceRequestHistory({
      organizationId: "org_northstar",
      workspaceId: "ws_production",
    });
    expect(all.items.length).toBe(7);

    const failedOnly = await loadWorkspaceRequestHistory({
      organizationId: "org_northstar",
      workspaceId: "ws_production",
      filters: { status: "failed" },
    });
    expect(failedOnly.items.length).toBe(1);
    expect(failedOnly.items[0].status).toBe("failed");
    expect(failedOnly.items[0].requestId).toBe("req_01jq8a5e89");

    const claudeOnly = await loadWorkspaceRequestHistory({
      organizationId: "org_northstar",
      workspaceId: "ws_production",
      filters: { model: "anthropic/claude-3-5-sonnet" },
    });
    expect(claudeOnly.items.length).toBe(2);
  });

  it("enforces tenant isolation and rejects cross-tenant request detail lookup", async () => {
    // Attempting to access Orbit request under Northstar workspace
    const crossTenantDetail = await loadWorkspaceRequestDetail({
      organizationId: "org_northstar",
      workspaceId: "ws_production",
      organizationSlug: "northstar",
      workspaceSlug: "production",
      requestId: "req_orbit_01",
    });
    expect(crossTenantDetail).toBeNull();

    // Attempting to access Northstar request under Orbit workspace
    const crossTenantDetail2 = await loadWorkspaceRequestDetail({
      organizationId: "org_orbit",
      workspaceId: "ws_orbit",
      organizationSlug: "orbit",
      workspaceSlug: "core",
      requestId: "req_01jq8a9x71",
    });
    expect(crossTenantDetail2).toBeNull();
  });

  it("respects Phase-35 zero content retention governance rules", async () => {
    // Production workspace has standard retention
    const prodDetail = await loadWorkspaceRequestDetail({
      organizationId: "org_northstar",
      workspaceId: "ws_production",
      organizationSlug: "northstar",
      workspaceSlug: "production",
      requestId: "req_01jq8a9x71",
    });
    expect(prodDetail?.governance.contentRetained).toBe(true);
    expect(prodDetail?.promptContent).toBeDefined();

    // Staging workspace has zero retention
    const stagingDetail = await loadWorkspaceRequestDetail({
      organizationId: "org_northstar",
      workspaceId: "ws_staging",
      organizationSlug: "northstar",
      workspaceSlug: "staging",
      requestId: "req_01jq8a9x71",
    });
    expect(stagingDetail?.governance.contentRetained).toBe(false);
    expect(stagingDetail?.promptContent).toBeUndefined();
    expect(stagingDetail?.rawRequestJson).toBeUndefined();
  });
});
