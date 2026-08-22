import { describe, it, expect } from "vitest";
import { loadWorkspaceOverview } from "./overview-data";

describe("D4 Workspace Overview Data Layer", () => {
  it("loads active workspace overview with real metric totals", async () => {
    process.env.DEV_BYPASS_AUTH = "1";
    const data = await loadWorkspaceOverview({
      organizationSlug: "northstar",
      workspaceSlug: "production",
      organizationId: "org_northstar",
      workspaceId: "ws_production",
      period: "24h",
    });

    expect(data.isFirstRun).toBe(false);
    expect(data.status).toBe("ready");
    expect(data.metrics.totalRequests).toBe(1280);
    expect(data.metrics.completedRequests).toBe(1272);
    expect(data.metrics.failedRequests).toBe(8);
    expect(data.metrics.successRate).toBeCloseTo(99.38, 2);
    expect(data.metrics.p95LatencyMs).toBe(320);
    expect(data.metrics.p50LatencyMs).toBe(145);
    expect(data.metrics.activeKeysCount).toBe(3);

    // Financials
    expect(data.financials.availableBalanceFormatted).toBe("$450.00");
    expect(data.financials.totalSpendFormatted).toBe("$50.00");
    expect(data.financials.currency).toBe("USD");
    expect(data.financials.walletStatus).toBe("active");

    // Models
    expect(data.topModels).toHaveLength(3);
    expect(data.topModels[0]?.modelId).toBe("openai/gpt-4o");
    expect(data.topModels[0]?.share).toBe(60.9);

    // Recent Requests
    expect(data.recentRequests.length).toBeGreaterThan(0);
    expect(data.recentRequests[0]?.id).toBe("req_01jq8a9x71");
    expect(data.recentRequests[0]?.status).toBe("succeeded");
  });

  it("loads pristine zero-data state for first-run workspace without fabrication", async () => {
    process.env.DEV_BYPASS_AUTH = "1";
    const data = await loadWorkspaceOverview({
      organizationSlug: "acme-labs",
      workspaceSlug: "default",
      organizationId: "org_acme",
      workspaceId: "ws_default",
      period: "24h",
    });

    expect(data.isFirstRun).toBe(true);
    expect(data.metrics.totalRequests).toBe(0);
    expect(data.metrics.completedRequests).toBe(0);
    expect(data.metrics.failedRequests).toBe(0);
    expect(data.metrics.successRate).toBe(0);
    expect(data.metrics.p95LatencyMs).toBe(0);
    expect(data.metrics.activeKeysCount).toBe(0);
    expect(data.topModels).toHaveLength(0);
    expect(data.recentRequests).toHaveLength(0);
    expect(data.financials.availableBalanceFormatted).toBe("$100.00");
  });
});
