import { NextResponse } from "next/server";
import { loadTenantContext } from "../../../../../../lib/load-tenant-context";
import {
  loadWorkspaceApiKey,
  revokeWorkspaceApiKey,
} from "../../../../../../lib/api-keys-data";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string; apiKeyId: string }> },
) {
  const { workspaceId, apiKeyId } = await params;
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

  const key = await loadWorkspaceApiKey({
    organizationId: ws.organizationId,
    workspaceId: ws.workspaceId,
    apiKeyId,
  });

  if (!key) {
    return NextResponse.json({ error: "API key not found" }, { status: 404 });
  }

  return NextResponse.json({ data: key });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string; apiKeyId: string }> },
) {
  const { workspaceId, apiKeyId } = await params;
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
    const revoked = await revokeWorkspaceApiKey({
      organizationId: ws.organizationId,
      workspaceId: ws.workspaceId,
      apiKeyId,
    });

    return NextResponse.json({ success: true, data: revoked });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Failed to revoke API key",
      },
      { status: 400 },
    );
  }
}
