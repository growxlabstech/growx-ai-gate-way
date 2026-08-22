import { createHash } from "node:crypto";

export function computeBatchRequestHash(params: {
  organizationId: string;
  workspaceId: string;
  endpoint: string;
  completionWindow: string;
  inputFileId?: string | null;
  itemsHash?: string | null;
  metadata?: Record<string, unknown>;
}): string {
  const normalized = {
    organizationId: params.organizationId,
    workspaceId: params.workspaceId,
    endpoint: params.endpoint,
    completionWindow: params.completionWindow,
    inputFileId: params.inputFileId ?? null,
    itemsHash: params.itemsHash ?? null,
    metadata: params.metadata ?? {},
  };

  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}
