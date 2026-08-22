import {
  generateApiKeyCredentials,
  publicPrefix,
  type ApiKeyEnvironment,
} from "./api-key-format";

export type { ApiKeyEnvironment };
export type ApiKeyStatus = "active" | "revoked" | "expired";

export type ApiKeyScope =
  | "responses.create"
  | "embeddings.create"
  | "files.read"
  | "files.write"
  | "batches.create"
  | "models.read"
  | "usage.read"
  | "webhooks.manage";

export interface ConsoleApiKey {
  id: string;
  organizationId: string;
  workspaceId: string;
  environmentId: string;
  environment: ApiKeyEnvironment;
  name: string;
  prefix: string;
  maskedKey: string;
  status: ApiKeyStatus;
  permissions: readonly ApiKeyScope[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  revokedBy: string | null;
}

export interface CreateApiKeyInput {
  name: string;
  environment?: ApiKeyEnvironment;
  permissions?: ApiKeyScope[];
  expiresInDays?: number | null; // null or 0 = never
}

export interface CreateApiKeyResponse {
  apiKey: ConsoleApiKey;
  secret: string;
}

export interface RotateApiKeyResponse {
  apiKey: ConsoleApiKey;
  secret: string;
  oldApiKey: ConsoleApiKey;
}

export const CANONICAL_API_KEY_SCOPES: {
  id: ApiKeyScope;
  label: string;
  group: string;
  description: string;
}[] = [
  {
    id: "models.read",
    label: "models.read",
    group: "Inference",
    description: "Discover available models and capabilities",
  },
  {
    id: "responses.create",
    label: "responses.create",
    group: "Inference",
    description: "Execute chat completions and generation requests",
  },
  {
    id: "embeddings.create",
    label: "embeddings.create",
    group: "Inference",
    description: "Generate vector embeddings for semantic search",
  },
  {
    id: "files.read",
    label: "files.read",
    group: "Files & Storage",
    description: "Inspect uploaded media and document files",
  },
  {
    id: "files.write",
    label: "files.write",
    group: "Files & Storage",
    description: "Upload and delete files and datasets",
  },
  {
    id: "batches.create",
    label: "batches.create",
    group: "Batch Execution",
    description: "Submit async batch inference jobs",
  },
  {
    id: "usage.read",
    label: "usage.read",
    group: "Management",
    description: "Query workspace usage metrics and token telemetry",
  },
  {
    id: "webhooks.manage",
    label: "webhooks.manage",
    group: "Management",
    description: "Configure and test webhook event delivery",
  },
];

export const DEFAULT_API_KEY_SCOPES: ApiKeyScope[] = [
  "models.read",
  "responses.create",
];

// In-memory tenant-isolated store for fixture / demo mode
const fixtureKeysStore = new Map<string, ConsoleApiKey[]>();

function initFixtureKeys() {
  if (fixtureKeysStore.has("ws_production")) return;

  const now = new Date();
  const prodKey1: ConsoleApiKey = {
    id: "key_01jq8a9xprod0001",
    organizationId: "org_northstar",
    workspaceId: "ws_production",
    environmentId: "env_production",
    environment: "production",
    name: "Production Backend API",
    prefix: "gx_live_key_01jq8a9xprod0001_••••••••••••",
    maskedKey: "gx_live_key_01jq8a9xprod0001_••••••••••••",
    status: "active",
    permissions: ["models.read", "responses.create", "embeddings.create"],
    createdBy: "usr_fixture",
    createdAt: new Date(now.getTime() - 14 * 24 * 3600 * 1000).toISOString(),
    updatedAt: new Date(now.getTime() - 14 * 24 * 3600 * 1000).toISOString(),
    expiresAt: null,
    lastUsedAt: new Date(now.getTime() - 2 * 60 * 1000).toISOString(), // 2m ago
    revokedAt: null,
    revokedBy: null,
  };

  const prodKey2: ConsoleApiKey = {
    id: "key_01jq8a9xprod0002",
    organizationId: "org_northstar",
    workspaceId: "ws_production",
    environmentId: "env_production",
    environment: "production",
    name: "CI/CD Smoke Runner",
    prefix: "gx_live_key_01jq8a9xprod0002_••••••••••••",
    maskedKey: "gx_live_key_01jq8a9xprod0002_••••••••••••",
    status: "active",
    permissions: ["models.read", "responses.create"],
    createdBy: "usr_fixture",
    createdAt: new Date(now.getTime() - 30 * 24 * 3600 * 1000).toISOString(),
    updatedAt: new Date(now.getTime() - 30 * 24 * 3600 * 1000).toISOString(),
    expiresAt: new Date(now.getTime() + 60 * 24 * 3600 * 1000).toISOString(),
    lastUsedAt: new Date(now.getTime() - 4 * 3600 * 1000).toISOString(), // 4h ago
    revokedAt: null,
    revokedBy: null,
  };

  const prodKey3: ConsoleApiKey = {
    id: "key_01jq8a9xprod0003",
    organizationId: "org_northstar",
    workspaceId: "ws_production",
    environmentId: "env_production",
    environment: "production",
    name: "Legacy Pipeline v1 (Revoked)",
    prefix: "gx_live_key_01jq8a9xprod0003_••••••••••••",
    maskedKey: "gx_live_key_01jq8a9xprod0003_••••••••••••",
    status: "revoked",
    permissions: ["models.read", "responses.create"],
    createdBy: "usr_fixture",
    createdAt: new Date(now.getTime() - 60 * 24 * 3600 * 1000).toISOString(),
    updatedAt: new Date(now.getTime() - 5 * 24 * 3600 * 1000).toISOString(),
    expiresAt: null,
    lastUsedAt: new Date(now.getTime() - 6 * 24 * 3600 * 1000).toISOString(),
    revokedAt: new Date(now.getTime() - 5 * 24 * 3600 * 1000).toISOString(),
    revokedBy: "usr_fixture",
  };

  fixtureKeysStore.set("ws_production", [prodKey1, prodKey2, prodKey3]);

  // Staging workspace
  const stageKey: ConsoleApiKey = {
    id: "key_01jq8a9xstage0001",
    organizationId: "org_northstar",
    workspaceId: "ws_staging",
    environmentId: "env_staging",
    environment: "staging",
    name: "Staging Test Key",
    prefix: "gx_test_key_01jq8a9xstage0001_••••••••••••",
    maskedKey: "gx_test_key_01jq8a9xstage0001_••••••••••••",
    status: "active",
    permissions: [
      "models.read",
      "responses.create",
      "files.read",
      "files.write",
    ],
    createdBy: "usr_fixture",
    createdAt: new Date(now.getTime() - 7 * 24 * 3600 * 1000).toISOString(),
    updatedAt: new Date(now.getTime() - 7 * 24 * 3600 * 1000).toISOString(),
    expiresAt: null,
    lastUsedAt: new Date(now.getTime() - 1 * 3600 * 1000).toISOString(),
    revokedAt: null,
    revokedBy: null,
  };
  fixtureKeysStore.set("ws_staging", [stageKey]);

  // Orbit / Acme - Empty initially
  fixtureKeysStore.set("ws_orbit", []);
  fixtureKeysStore.set("ws_default", []);
}

async function getCookiesHeader(): Promise<string> {
  try {
    const { cookies } = await import("next/headers");
    return (await cookies()).toString();
  } catch {
    return "";
  }
}

export async function loadWorkspaceApiKeys(params: {
  organizationId: string;
  workspaceId: string;
}): Promise<ConsoleApiKey[]> {
  initFixtureKeys();
  const cookieHeader = await getCookiesHeader();

  // In fixture or development mode, return from local store instantly
  if (
    process.env.D2_FIXTURE_IDENTITY === "1" ||
    cookieHeader.includes("gx_fixture=")
  ) {
    if (
      cookieHeader.includes("gx_fixture=d3-new") ||
      params.workspaceId === "ws_default" ||
      params.workspaceId === "ws_orbit"
    ) {
      return [];
    }
    return fixtureKeysStore.get(params.workspaceId) ?? [];
  }

  const identityServiceUrl =
    process.env.IDENTITY_SERVICE_URL ?? "http://127.0.0.1:4000";

  try {
    const response = await fetch(
      `${identityServiceUrl}/v1/organizations/${params.organizationId}/workspaces/${params.workspaceId}/api-keys`,
      {
        method: "GET",
        cache: "no-store",
        headers: { cookie: cookieHeader },
        signal: AbortSignal.timeout(2000),
      },
    );
    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data.data)) {
        return data.data;
      }
    }
  } catch {
    // Fall back to local tenant-scoped fixture store
  }

  return fixtureKeysStore.get(params.workspaceId) ?? [];
}

export async function loadWorkspaceApiKey(params: {
  organizationId: string;
  workspaceId: string;
  apiKeyId: string;
}): Promise<ConsoleApiKey | null> {
  const keys = await loadWorkspaceApiKeys(params);
  return keys.find((k) => k.id === params.apiKeyId) ?? null;
}

export async function createWorkspaceApiKey(params: {
  organizationId: string;
  workspaceId: string;
  input: CreateApiKeyInput;
}): Promise<CreateApiKeyResponse> {
  initFixtureKeys();
  const env = params.input.environment ?? "production";
  const { id, prefix, fullSecret } = generateApiKeyCredentials(env);
  const now = new Date();
  const expiresAt =
    params.input.expiresInDays && params.input.expiresInDays > 0
      ? new Date(
          now.getTime() + params.input.expiresInDays * 24 * 3600 * 1000,
        ).toISOString()
      : null;

  const newKey: ConsoleApiKey = {
    id,
    organizationId: params.organizationId,
    workspaceId: params.workspaceId,
    environmentId: `env_${env}`,
    environment: env,
    name: params.input.name.trim() || "API Key",
    prefix: publicPrefix(env, id),
    maskedKey: publicPrefix(env, id),
    status: "active",
    permissions:
      params.input.permissions && params.input.permissions.length > 0
        ? params.input.permissions
        : DEFAULT_API_KEY_SCOPES,
    createdBy: "usr_console",
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    expiresAt,
    lastUsedAt: null,
    revokedAt: null,
    revokedBy: null,
  };

  const existing = fixtureKeysStore.get(params.workspaceId) ?? [];
  fixtureKeysStore.set(params.workspaceId, [newKey, ...existing]);

  return {
    apiKey: newKey,
    secret: fullSecret,
  };
}

export async function revokeWorkspaceApiKey(params: {
  organizationId: string;
  workspaceId: string;
  apiKeyId: string;
}): Promise<ConsoleApiKey> {
  initFixtureKeys();
  const keys = fixtureKeysStore.get(params.workspaceId) ?? [];
  const keyIndex = keys.findIndex((k) => k.id === params.apiKeyId);
  if (keyIndex === -1) {
    throw new Error(`API key '${params.apiKeyId}' not found`);
  }

  const current = keys[keyIndex]!;
  const updated: ConsoleApiKey = {
    ...current,
    status: "revoked",
    revokedAt: new Date().toISOString(),
    revokedBy: "usr_console",
    updatedAt: new Date().toISOString(),
  };

  keys[keyIndex] = updated;
  fixtureKeysStore.set(params.workspaceId, keys);
  return updated;
}

export async function rotateWorkspaceApiKey(params: {
  organizationId: string;
  workspaceId: string;
  apiKeyId: string;
}): Promise<RotateApiKeyResponse> {
  initFixtureKeys();
  const oldKey = await revokeWorkspaceApiKey(params);
  const created = await createWorkspaceApiKey({
    organizationId: params.organizationId,
    workspaceId: params.workspaceId,
    input: {
      name: `${oldKey.name} (Rotated)`,
      environment: oldKey.environment,
      permissions: [...oldKey.permissions],
    },
  });

  return {
    apiKey: created.apiKey,
    secret: created.secret,
    oldApiKey: oldKey,
  };
}
