import { NextResponse } from "next/server";
import { loadTenantContext } from "../../../../../lib/load-tenant-context";
import {
  createWorkspaceApiKey,
  loadWorkspaceApiKeys,
} from "../../../../../lib/api-keys-data";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await params;
  const tenant = await loadTenantContext();
  if (tenant.status !== "ready") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Find workspace in tenant context to ensure scoping
  const ws = tenant.context.workspaces.find(
    (w) => w.workspaceId === workspaceId,
  );
  if (!ws) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  const keys = await loadWorkspaceApiKeys({
    organizationId: ws.organizationId,
    workspaceId: ws.workspaceId,
  });

  return NextResponse.json({ data: keys });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await params;
  const tenant = await loadTenantContext();
  if (tenant.status !== "ready") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ws = tenant.context.workspaces.find(
    (w) => w.workspaceId === workspaceId,
  );
  if (!ws) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  try {
    const body = await request.json();
    const result = await createWorkspaceApiKey({
      organizationId: ws.organizationId,
      workspaceId: ws.workspaceId,
      input: {
        name: body.name ?? "API Key",
        environment: body.environment ?? "production",
        permissions: body.permissions,
        expiresInDays: body.expiresInDays,
      },
    });

    return NextResponse.json(result, {
      status: 201,
      headers: {
        "cache-control":
          "no-store, no-cache, must-revalidate, proxy-revalidate",
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Failed to create API key",
      },
      { status: 400 },
    );
  }
}
