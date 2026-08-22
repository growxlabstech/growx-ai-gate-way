import { NextResponse } from "next/server";
import { loadTenantContext } from "../../../../../../../lib/load-tenant-context";
import { rotateWorkspaceApiKey } from "../../../../../../../lib/api-keys-data";

export async function POST(
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
    const result = await rotateWorkspaceApiKey({
      organizationId: ws.organizationId,
      workspaceId: ws.workspaceId,
      apiKeyId,
    });

    return NextResponse.json(result, {
      status: 200,
      headers: {
        "cache-control":
          "no-store, no-cache, must-revalidate, proxy-revalidate",
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Failed to rotate API key",
      },
      { status: 400 },
    );
  }
}
