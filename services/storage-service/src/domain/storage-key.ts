import { StorageError } from "./types.js";

export function sanitizeFileName(originalName: string): string {
  if (!originalName || typeof originalName !== "string") {
    return "unnamed_file";
  }
  let clean = originalName.replace(/[\x00-\x1f\x7f]/g, "");
  clean = clean.replace(/\\/g, "/");
  const base = clean.split("/").filter(Boolean).pop() ?? "unnamed_file";
  const safe = base.replace(/\.\./g, "").replace(/[^a-zA-Z0-9._-]/g, "_");
  return safe.slice(0, 200) || "unnamed_file";
}

export function validatePathSafety(key: string): boolean {
  if (!key || typeof key !== "string") return false;
  if (key.includes("..") || key.includes("\\") || key.includes("\x00")) {
    return false;
  }
  return true;
}

export function generateStorageKey(params: {
  organizationId: string;
  workspaceId?: string | null | undefined;
  fileId: string;
  safeFileName?: string | undefined;
  prefix?: string | undefined;
}): string {
  const { organizationId, workspaceId, fileId, prefix = "files" } = params;
  if (!organizationId || !fileId) {
    throw new StorageError("INVALID_STORAGE_KEY", "organizationId and fileId are required for storage key");
  }
  const wsPart = workspaceId ? `ws_${workspaceId}` : "default";
  return `org/${organizationId}/workspace/${wsPart}/${prefix}/${fileId}/content`;
}
