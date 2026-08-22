export interface AdminSummary {
  activeIncidentsCount: number;
  degradedProvidersCount: number;
  failedWorkersCount: number;
  reconciliationMismatchCount: number;
  totalUsersCount: number;
  totalOrganizationsCount: number;
  recentAuditEvents: AdminAuditEventItem[];
  recentSecurityEvents: AdminSecurityEventItem[];
  activeIncidents: AdminIncidentItem[];
  providerHealthSummary: AdminProviderItem[];
  workerHealthSummary: AdminWorkerItem[];
}

export interface AdminUserItem {
  id: string;
  email: string;
  name: string;
  status: "active" | "suspended";
  mfaEnabled: boolean;
  role: string;
  organizationsCount: number;
  createdAt: string;
  lastLoginAt: string;
}

export interface AdminOrganizationItem {
  id: string;
  slug: string;
  name: string;
  tier: string;
  status: "active" | "suspended";
  workspacesCount: number;
  membersCount: number;
  totalSpendFormatted: string;
  createdAt: string;
}

export interface AdminWorkspaceItem {
  id: string;
  organizationId: string;
  slug: string;
  name: string;
  environment: "production" | "staging" | "development";
  dataRetention: "standard" | "zero_retention";
  rpmQuota: number;
  tpmQuota: number;
  createdAt: string;
}

export interface AdminProviderItem {
  id: string;
  name: string;
  status: "healthy" | "degraded" | "circuit_open";
  circuitState: "closed" | "open" | "half_open";
  isDraining: boolean;
  accountsCount: number;
  activeRoutesCount: number;
  p95LatencyMs: number;
  errorRatePercent: number;
  lastIncidentAt?: string | undefined;
}

export interface AdminModelItem {
  id: string;
  name: string;
  family: string;
  primaryProvider: string;
  contextWindow: number;
  status: "active" | "disabled" | "deprecated";
  capabilities: string[];
  pricingPerMillionPrompt: string;
  pricingPerMillionCompletion: string;
}

export interface AdminRoutingPolicyItem {
  id: string;
  name: string;
  strategy: "latency_optimized" | "cost_optimized" | "balanced_performance";
  primaryRoute: string;
  fallbackChain: string[];
  hysteresisPenaltyMs: number;
  isActive: boolean;
}

export interface AdminPaymentItem {
  id: string;
  orderId: string;
  organizationSlug: string;
  amount: number;
  amountFormatted: string;
  currency: string;
  rail: "UPI" | "Card" | "Netbanking";
  status: "succeeded" | "failed" | "refunded";
  timestamp: string;
}

export interface AdminWorkerItem {
  id: string;
  name: string;
  status: "healthy" | "degraded" | "backlog" | "stopped";
  queueDepth: number;
  oldestJobAgeSeconds: number;
  processedLastHour: number;
}

export interface AdminIncidentItem {
  id: string;
  title: string;
  severity: "P0" | "P1" | "P2";
  status: "active" | "investigating" | "resolved";
  affectedCapability: string;
  startedAt: string;
  resolvedAt?: string | undefined;
  summary: string;
}

export interface AdminAuditEventItem {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  target: string;
  status: "success" | "denied" | "failed";
  hashChain: string;
}

export interface AdminSecurityEventItem {
  id: string;
  timestamp: string;
  severity: "critical" | "high" | "medium" | "low";
  type: string;
  targetOrg: string;
  status: "acknowledged" | "investigating" | "resolved";
  details: string;
}

// ---------------------------------------------------------------------------
// Static Data & Deterministic Operations Layer
// ---------------------------------------------------------------------------

const now = Date.now();

export async function loadAdminSummary(): Promise<AdminSummary> {
  const providers = await listAdminProviders();
  const workers = await listAdminWorkers();
  const incidents = await listAdminIncidents();
  const audits = await listAdminAuditEvents();
  const security = await listAdminSecurityEvents();

  return {
    activeIncidentsCount: incidents.filter((i) => i.status !== "resolved")
      .length,
    degradedProvidersCount: providers.filter((p) => p.status !== "healthy")
      .length,
    failedWorkersCount: workers.filter((w) => w.status !== "healthy").length,
    reconciliationMismatchCount: 0,
    totalUsersCount: 142,
    totalOrganizationsCount: 28,
    recentAuditEvents: audits.slice(0, 5),
    recentSecurityEvents: security.slice(0, 5),
    activeIncidents: incidents,
    providerHealthSummary: providers,
    workerHealthSummary: workers,
  };
}

export async function listAdminUsers(): Promise<AdminUserItem[]> {
  return [
    {
      id: "usr_northstar_owner",
      email: "alex@northstar.example.com",
      name: "Alex Thorne",
      status: "active",
      mfaEnabled: true,
      role: "Super Admin",
      organizationsCount: 2,
      createdAt: "2026-01-15T10:00:00Z",
      lastLoginAt: new Date(now - 15 * 60 * 1000).toISOString(),
    },
    {
      id: "usr_northstar_admin",
      email: "sarah@northstar.example.com",
      name: "Sarah Chen",
      status: "active",
      mfaEnabled: true,
      role: "Admin",
      organizationsCount: 1,
      createdAt: "2026-01-20T14:30:00Z",
      lastLoginAt: new Date(now - 2 * 3600 * 1000).toISOString(),
    },
    {
      id: "usr_orbit_lead",
      email: "devon@orbit.example.com",
      name: "Devon Vance",
      status: "active",
      mfaEnabled: false,
      role: "Developer",
      organizationsCount: 1,
      createdAt: "2026-03-10T08:30:00Z",
      lastLoginAt: new Date(now - 24 * 3600 * 1000).toISOString(),
    },
    {
      id: "usr_suspended_test",
      email: "abusive_bot@external.test",
      name: "Abuse Test Bot",
      status: "suspended",
      mfaEnabled: false,
      role: "Developer",
      organizationsCount: 1,
      createdAt: "2026-04-01T00:00:00Z",
      lastLoginAt: "2026-04-02T12:00:00Z",
    },
  ];
}

export async function listAdminOrganizations(): Promise<
  AdminOrganizationItem[]
> {
  return [
    {
      id: "org_northstar",
      slug: "northstar",
      name: "Northstar Technologies LLC",
      tier: "Scale Enterprise",
      status: "active",
      workspacesCount: 2,
      membersCount: 4,
      totalSpendFormatted: "$1,450.00",
      createdAt: "2026-01-15T10:00:00Z",
    },
    {
      id: "org_orbit",
      slug: "orbit",
      name: "Orbit Intelligence Inc.",
      tier: "Developer Sandbox",
      status: "active",
      workspacesCount: 1,
      membersCount: 2,
      totalSpendFormatted: "$120.00",
      createdAt: "2026-03-10T08:00:00Z",
    },
  ];
}

export async function listAdminWorkspaces(): Promise<AdminWorkspaceItem[]> {
  return [
    {
      id: "ws_northstar_prod",
      organizationId: "org_northstar",
      slug: "production",
      name: "Production Gateway",
      environment: "production",
      dataRetention: "standard",
      rpmQuota: 3000,
      tpmQuota: 2000000,
      createdAt: "2026-01-15T12:00:00Z",
    },
    {
      id: "ws_northstar_staging",
      organizationId: "org_northstar",
      slug: "staging",
      name: "Staging Gateway",
      environment: "staging",
      dataRetention: "zero_retention",
      rpmQuota: 1000,
      tpmQuota: 500000,
      createdAt: "2026-02-01T10:00:00Z",
    },
    {
      id: "ws_orbit_core",
      organizationId: "org_orbit",
      slug: "core",
      name: "Core Gateway",
      environment: "production",
      dataRetention: "standard",
      rpmQuota: 300,
      tpmQuota: 150000,
      createdAt: "2026-03-10T08:30:00Z",
    },
  ];
}

export async function listAdminProviders(): Promise<AdminProviderItem[]> {
  return [
    {
      id: "openai",
      name: "OpenAI Platform",
      status: "healthy",
      circuitState: "closed",
      isDraining: false,
      accountsCount: 3,
      activeRoutesCount: 8,
      p95LatencyMs: 340,
      errorRatePercent: 0.02,
    },
    {
      id: "anthropic",
      name: "Anthropic Claude API",
      status: "healthy",
      circuitState: "closed",
      isDraining: false,
      accountsCount: 2,
      activeRoutesCount: 5,
      p95LatencyMs: 410,
      errorRatePercent: 0.05,
    },
    {
      id: "google",
      name: "Google Vertex AI",
      status: "healthy",
      circuitState: "closed",
      isDraining: false,
      accountsCount: 2,
      activeRoutesCount: 4,
      p95LatencyMs: 290,
      errorRatePercent: 0.01,
    },
    {
      id: "groq",
      name: "Groq LPU Inference",
      status: "healthy",
      circuitState: "closed",
      isDraining: false,
      accountsCount: 1,
      activeRoutesCount: 2,
      p95LatencyMs: 95,
      errorRatePercent: 0.04,
    },
    {
      id: "mistral",
      name: "Mistral AI",
      status: "degraded",
      circuitState: "half_open",
      isDraining: true,
      accountsCount: 1,
      activeRoutesCount: 2,
      p95LatencyMs: 820,
      errorRatePercent: 4.8,
      lastIncidentAt: new Date(now - 45 * 60 * 1000).toISOString(),
    },
  ];
}

export async function listAdminModels(): Promise<AdminModelItem[]> {
  return [
    {
      id: "gpt-4o",
      name: "GPT-4o Omnimodal",
      family: "OpenAI GPT-4",
      primaryProvider: "openai",
      contextWindow: 128000,
      status: "active",
      capabilities: ["text", "vision", "tools", "structured_output"],
      pricingPerMillionPrompt: "$2.50",
      pricingPerMillionCompletion: "$10.00",
    },
    {
      id: "claude-3-5-sonnet",
      name: "Claude 3.5 Sonnet",
      family: "Anthropic Claude 3.5",
      primaryProvider: "anthropic",
      contextWindow: 200000,
      status: "active",
      capabilities: ["text", "vision", "tools", "structured_output"],
      pricingPerMillionPrompt: "$3.00",
      pricingPerMillionCompletion: "$15.00",
    },
    {
      id: "gemini-1.5-pro",
      name: "Gemini 1.5 Pro",
      family: "Google Gemini",
      primaryProvider: "google",
      contextWindow: 2000000,
      status: "active",
      capabilities: ["text", "vision", "audio", "tools"],
      pricingPerMillionPrompt: "$3.50",
      pricingPerMillionCompletion: "$10.50",
    },
    {
      id: "growx/fast",
      name: "GrowX Intelligent Fast",
      family: "Intelligent Alias",
      primaryProvider: "groq",
      contextWindow: 128000,
      status: "active",
      capabilities: ["text", "tools"],
      pricingPerMillionPrompt: "$0.50",
      pricingPerMillionCompletion: "$1.50",
    },
    {
      id: "mistral-large-2407",
      name: "Mistral Large 2",
      family: "Mistral Large",
      primaryProvider: "mistral",
      contextWindow: 128000,
      status: "disabled",
      capabilities: ["text", "tools"],
      pricingPerMillionPrompt: "$2.00",
      pricingPerMillionCompletion: "$6.00",
    },
  ];
}

export async function listAdminRoutingPolicies(): Promise<
  AdminRoutingPolicyItem[]
> {
  return [
    {
      id: "pol_latency_v2",
      name: "Latency Optimized V2 (Default)",
      strategy: "latency_optimized",
      primaryRoute: "groq -> openai -> anthropic",
      fallbackChain: [
        "groq:llama-3.3-70b",
        "openai:gpt-4o-mini",
        "anthropic:claude-3-haiku",
      ],
      hysteresisPenaltyMs: 50,
      isActive: true,
    },
    {
      id: "pol_quality_tier1",
      name: "Maximum Intelligence Tier 1",
      strategy: "balanced_performance",
      primaryRoute: "anthropic:claude-3-5-sonnet -> openai:gpt-4o",
      fallbackChain: [
        "anthropic:claude-3-5-sonnet",
        "openai:gpt-4o",
        "google:gemini-1.5-pro",
      ],
      hysteresisPenaltyMs: 100,
      isActive: true,
    },
  ];
}

export async function listAdminWorkers(): Promise<AdminWorkerItem[]> {
  return [
    {
      id: "wrk_batch",
      name: "Batch Inference Execution Plane",
      status: "healthy",
      queueDepth: 0,
      oldestJobAgeSeconds: 0,
      processedLastHour: 1420,
    },
    {
      id: "wrk_health_probe",
      name: "Provider Health & Circuit Prober",
      status: "healthy",
      queueDepth: 0,
      oldestJobAgeSeconds: 0,
      processedLastHour: 3600,
    },
    {
      id: "wrk_webhooks",
      name: "Phase-21 Webhook Dispatcher",
      status: "healthy",
      queueDepth: 2,
      oldestJobAgeSeconds: 1,
      processedLastHour: 840,
    },
    {
      id: "wrk_reconciliation",
      name: "Phase-20 Settlement Reconciliation",
      status: "healthy",
      queueDepth: 0,
      oldestJobAgeSeconds: 0,
      processedLastHour: 60,
    },
  ];
}

export async function listAdminIncidents(): Promise<AdminIncidentItem[]> {
  return [
    {
      id: "inc_2026_08_01",
      title: "Mistral AI upstream rate-limiting elevation",
      severity: "P2",
      status: "investigating",
      affectedCapability: "mistral-large-2407",
      startedAt: new Date(now - 45 * 60 * 1000).toISOString(),
      summary:
        "Upstream 429 response rate exceeded 4.8%. Circuit breaker automatically set to half-open; traffic gracefully redirected to Groq/OpenAI.",
    },
  ];
}

export async function listAdminAuditEvents(): Promise<AdminAuditEventItem[]> {
  return [
    {
      id: "aud_01jq8a9x01",
      timestamp: new Date(now - 12 * 60 * 1000).toISOString(),
      actor: "operator:alex@growx.internal",
      action: "provider.drain.enable",
      target: "provider:mistral",
      status: "success",
      hashChain:
        "sha256:7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069",
    },
    {
      id: "aud_01jq8a9x02",
      timestamp: new Date(now - 2 * 3600 * 1000).toISOString(),
      actor: "operator:sarah@growx.internal",
      action: "model.status.disable",
      target: "model:mistral-large-2407",
      status: "success",
      hashChain:
        "sha256:cb8379ac2098aa165029e3938a51da0bcecfc008fd6795f401178647f96c5b34",
    },
    {
      id: "aud_01jq8a9x03",
      timestamp: new Date(now - 18 * 3600 * 1000).toISOString(),
      actor: "operator:alex@growx.internal",
      action: "wallet.ledger.adjustment",
      target: "org:org_northstar",
      status: "success",
      hashChain:
        "sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
    },
  ];
}

export async function listAdminSecurityEvents(): Promise<
  AdminSecurityEventItem[]
> {
  return [
    {
      id: "sec_01jq8a9x01",
      timestamp: new Date(now - 30 * 60 * 1000).toISOString(),
      severity: "medium",
      type: "rate_limit_spike",
      targetOrg: "org_northstar (ws_staging)",
      status: "resolved",
      details:
        "Spike of 800 req/min handled and throttled cleanly by Phase-11 leaky bucket.",
    },
    {
      id: "sec_01jq8a9x02",
      timestamp: new Date(now - 12 * 3600 * 1000).toISOString(),
      severity: "high",
      type: "unauthorized_ip_attempt",
      targetOrg: "org_orbit",
      status: "acknowledged",
      details:
        "Repeated invalid API key probes from 203.0.113.88 blocked by edge firewall.",
    },
  ];
}
