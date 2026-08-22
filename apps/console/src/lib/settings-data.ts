export type MemberRole =
  "Owner" | "Admin" | "Developer" | "Billing Manager" | "Viewer";

export interface OrganizationMemberItem {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: MemberRole;
  joinedAt: string;
  isCurrentUser: boolean;
}

export interface PendingInvitationItem {
  id: string;
  email: string;
  role: MemberRole;
  invitedBy: string;
  invitedAt: string;
  expiresAt: string;
  status: "pending" | "accepted" | "expired" | "revoked";
}

export interface ActiveSessionItem {
  id: string;
  device: string;
  browser: string;
  ipAddress: string;
  location: string;
  createdAt: string;
  lastActiveAt: string;
  isCurrent: boolean;
}

export interface WebhookEndpointItem {
  id: string;
  url: string;
  description: string;
  events: string[];
  status: "active" | "failing" | "disabled";
  createdAt: string;
  lastDeliveryAt?: string | undefined;
  lastDeliveryStatus?: "succeeded" | "failed" | undefined;
}

export interface OrganizationSettingsDetails {
  organizationId: string;
  organizationSlug: string;
  organizationName: string;
  createdAt: string;
  ownerEmail: string;
  tier: string;
  totalWorkspaces: number;
  totalMembers: number;
}

export interface WorkspaceSettingsDetails {
  workspaceId: string;
  workspaceSlug: string;
  workspaceName: string;
  environment: "production" | "staging" | "development";
  dataRetentionPolicy: "standard" | "zero_retention";
  dataResidency: "global" | "us_only" | "eu_only";
  allowedProviders: string[];
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Data Access Fetchers & Upstream Integration
// ---------------------------------------------------------------------------

function getBaseServicesUrl(): string {
  return process.env.IDENTITY_SERVICE_URL ?? "http://127.0.0.1:4100";
}

export async function loadOrganizationSettings(params: {
  organizationId: string;
  organizationSlug: string;
}): Promise<OrganizationSettingsDetails> {
  const isOrbit =
    params.organizationSlug === "orbit" ||
    params.organizationId.includes("orbit");

  return {
    organizationId: isOrbit ? "org_orbit" : "org_northstar",
    organizationSlug: isOrbit ? "orbit" : "northstar",
    organizationName: isOrbit ? "Orbit Intelligence" : "Northstar Technologies",
    createdAt: isOrbit ? "2026-03-10T08:00:00Z" : "2026-01-15T10:00:00Z",
    ownerEmail: isOrbit
      ? "owner@orbit.example.com"
      : "admin@northstar.example.com",
    tier: isOrbit ? "Developer Sandbox" : "Scale Enterprise",
    totalWorkspaces: isOrbit ? 1 : 2,
    totalMembers: isOrbit ? 2 : 4,
  };
}

export async function loadWorkspaceSettings(params: {
  organizationId: string;
  workspaceId: string;
  workspaceSlug: string;
}): Promise<WorkspaceSettingsDetails> {
  const isStaging =
    params.workspaceSlug === "staging" ||
    params.workspaceId.includes("staging");
  const isOrbit =
    params.workspaceSlug === "core" || params.workspaceId.includes("orbit");

  return {
    workspaceId: params.workspaceId,
    workspaceSlug: params.workspaceSlug,
    workspaceName: isStaging
      ? "Staging Gateway"
      : isOrbit
        ? "Core Gateway"
        : "Production Gateway",
    environment: isStaging ? "staging" : "production",
    dataRetentionPolicy: isStaging ? "zero_retention" : "standard",
    dataResidency: "global",
    allowedProviders: ["openai", "anthropic", "google", "groq"],
    createdAt: "2026-01-15T12:00:00Z",
  };
}

export async function loadOrganizationMembers(params: {
  organizationId: string;
}): Promise<OrganizationMemberItem[]> {
  const isOrbit = params.organizationId.includes("orbit");

  if (isOrbit) {
    return [
      {
        id: "mem_orbit_01",
        userId: "usr_orbit_lead",
        name: "Devon Vance",
        email: "devon@orbit.example.com",
        role: "Owner",
        joinedAt: "2026-03-10T08:30:00Z",
        isCurrentUser: true,
      },
      {
        id: "mem_orbit_02",
        userId: "usr_orbit_dev",
        name: "Elena Rostova",
        email: "elena@orbit.example.com",
        role: "Developer",
        joinedAt: "2026-03-15T11:00:00Z",
        isCurrentUser: false,
      },
    ];
  }

  return [
    {
      id: "mem_ns_01",
      userId: "usr_northstar_owner",
      name: "Alex Thorne",
      email: "alex@northstar.example.com",
      role: "Owner",
      joinedAt: "2026-01-15T10:15:00Z",
      isCurrentUser: true,
    },
    {
      id: "mem_ns_02",
      userId: "usr_northstar_admin",
      name: "Sarah Chen",
      email: "sarah@northstar.example.com",
      role: "Admin",
      joinedAt: "2026-01-20T14:30:00Z",
      isCurrentUser: false,
    },
    {
      id: "mem_ns_03",
      userId: "usr_northstar_dev1",
      name: "Marcus Brody",
      email: "marcus@northstar.example.com",
      role: "Developer",
      joinedAt: "2026-02-01T09:00:00Z",
      isCurrentUser: false,
    },
    {
      id: "mem_ns_04",
      userId: "usr_northstar_bill",
      name: "Rachel Hayes",
      email: "rachel@northstar.example.com",
      role: "Billing Manager",
      joinedAt: "2026-02-15T16:45:00Z",
      isCurrentUser: false,
    },
  ];
}

export async function loadPendingInvitations(params: {
  organizationId: string;
}): Promise<PendingInvitationItem[]> {
  const isOrbit = params.organizationId.includes("orbit");

  if (isOrbit) {
    return [];
  }

  return [
    {
      id: "inv_ns_pending_01",
      email: "jordan.taylor@northstar.example.com",
      role: "Developer",
      invitedBy: "alex@northstar.example.com",
      invitedAt: new Date(Date.now() - 2 * 86400 * 1000).toISOString(),
      expiresAt: new Date(Date.now() + 5 * 86400 * 1000).toISOString(),
      status: "pending",
    },
  ];
}

export async function loadActiveSessions(): Promise<ActiveSessionItem[]> {
  const now = Date.now();
  return [
    {
      id: "sess_curr_01",
      device: "MacBook Pro 16-inch",
      browser: "Chrome 128.0 (macOS Sequoia)",
      ipAddress: "192.0.2.45",
      location: "San Francisco, United States",
      createdAt: new Date(now - 3 * 3600 * 1000).toISOString(),
      lastActiveAt: new Date(now - 30 * 1000).toISOString(),
      isCurrent: true,
    },
    {
      id: "sess_sec_02",
      device: "Linux Workstation",
      browser: "Firefox 130.0 (Ubuntu 24.04)",
      ipAddress: "198.51.100.12",
      location: "Seattle, United States",
      createdAt: new Date(now - 48 * 3600 * 1000).toISOString(),
      lastActiveAt: new Date(now - 12 * 3600 * 1000).toISOString(),
      isCurrent: false,
    },
  ];
}

export async function loadWebhookEndpoints(params: {
  organizationId: string;
  workspaceId: string;
}): Promise<WebhookEndpointItem[]> {
  const isOrbit = params.workspaceId.includes("orbit");

  if (isOrbit) {
    return [];
  }

  return [
    {
      id: "whep_01jq8a9x01",
      url: "https://api.northstar.example.com/webhooks/growx-events",
      description: "Primary Production Event Sink",
      events: [
        "chat.completion.completed",
        "batch.job.completed",
        "quota.warning",
      ],
      status: "active",
      createdAt: "2026-02-01T12:00:00Z",
      lastDeliveryAt: new Date(Date.now() - 45 * 1000).toISOString(),
      lastDeliveryStatus: "succeeded",
    },
  ];
}
