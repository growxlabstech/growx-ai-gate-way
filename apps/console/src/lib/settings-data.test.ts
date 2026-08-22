import { describe, expect, it } from "vitest";
import {
  loadActiveSessions,
  loadOrganizationMembers,
  loadOrganizationSettings,
  loadPendingInvitations,
  loadWebhookEndpoints,
  loadWorkspaceSettings,
} from "./settings-data";

describe("D9 Customer Settings Data Layer", () => {
  it("loads authoritative organization settings and metadata", async () => {
    const org = await loadOrganizationSettings({
      organizationId: "org_northstar",
      organizationSlug: "northstar",
    });

    expect(org.organizationId).toBe("org_northstar");
    expect(org.organizationName).toBe("Northstar Technologies");
    expect(org.tier).toBe("Scale Enterprise");
    expect(org.totalWorkspaces).toBe(2);
    expect(org.totalMembers).toBe(4);
  });

  it("loads workspace configuration and Phase-35 governance policies", async () => {
    const prodWs = await loadWorkspaceSettings({
      organizationId: "org_northstar",
      workspaceId: "ws_production",
      workspaceSlug: "production",
    });

    expect(prodWs.workspaceName).toBe("Production Gateway");
    expect(prodWs.environment).toBe("production");
    expect(prodWs.dataRetentionPolicy).toBe("standard");
    expect(prodWs.allowedProviders).toContain("openai");

    const stagingWs = await loadWorkspaceSettings({
      organizationId: "org_northstar",
      workspaceId: "ws_staging",
      workspaceSlug: "staging",
    });
    expect(stagingWs.environment).toBe("staging");
    expect(stagingWs.dataRetentionPolicy).toBe("zero_retention");
  });

  it("loads canonical organization members and pending invitations", async () => {
    const members = await loadOrganizationMembers({
      organizationId: "org_northstar",
    });
    expect(members.length).toBe(4);
    expect(members[0].role).toBe("Owner");
    expect(members[0].isCurrentUser).toBe(true);

    const invites = await loadPendingInvitations({
      organizationId: "org_northstar",
    });
    expect(invites.length).toBe(1);
    expect(invites[0].status).toBe("pending");
    expect(invites[0].role).toBe("Developer");
  });

  it("loads active user sessions with current session badge", async () => {
    const sessions = await loadActiveSessions();
    expect(sessions.length).toBe(2);
    expect(sessions[0].isCurrent).toBe(true);
    expect(sessions[0].device).toBe("MacBook Pro 16-inch");
    expect(sessions[1].isCurrent).toBe(false);
  });

  it("loads configured customer webhook endpoints", async () => {
    const endpoints = await loadWebhookEndpoints({
      organizationId: "org_northstar",
      workspaceId: "ws_production",
    });

    expect(endpoints.length).toBe(1);
    expect(endpoints[0].url).toContain("https://");
    expect(endpoints[0].status).toBe("active");
    expect(endpoints[0].events).toContain("chat.completion.completed");
  });

  it("enforces strict multi-tenant isolation between Northstar and Orbit", async () => {
    const orbitMembers = await loadOrganizationMembers({
      organizationId: "org_orbit",
    });
    expect(orbitMembers.length).toBe(2);
    expect(orbitMembers[0].name).toBe("Devon Vance");
    expect(orbitMembers.find((m) => m.name === "Alex Thorne")).toBeUndefined();

    const orbitWebhooks = await loadWebhookEndpoints({
      organizationId: "org_orbit",
      workspaceId: "ws_orbit",
    });
    expect(orbitWebhooks.length).toBe(0);
  });
});
