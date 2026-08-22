import { createServer, IncomingMessage, ServerResponse } from "node:http";
import {
  createFileRequestSchema,
  completeFileUploadRequestSchema,
  fileListQuerySchema,
} from "@growx/contracts";
import { FileService } from "../application/file-service.js";
import { TenantContext, StorageError } from "../domain/types.js";

function parseJsonBody<T>(req: IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) =>
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)),
    );
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : ({} as T));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function extractTenant(req: IncomingMessage): TenantContext {
  const orgId = (req.headers["x-organization-id"] as string) || "org_default";
  const wsId = (req.headers["x-workspace-id"] as string) || null;
  const userId = (req.headers["x-user-id"] as string) || null;
  return { organizationId: orgId, workspaceId: wsId, userId };
}

export function createStorageHttpServer(fileService: FileService) {
  return createServer(async (req, res) => {
    const url = new URL(
      req.url || "/",
      `http://${req.headers.host || "localhost"}`,
    );
    const pathname = url.pathname;
    const method = req.method || "GET";

    try {
      // Health routes
      if (
        pathname === "/health" ||
        pathname === "/live" ||
        pathname === "/ready"
      ) {
        sendJson(res, 200, {
          status: "ok",
          service: "storage-service",
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const tenant = extractTenant(req);

      // POST /v1/files -> Create file & upload session
      if (method === "POST" && pathname === "/v1/files") {
        const body = await parseJsonBody(req);
        const parsed = createFileRequestSchema.parse(body);
        const response = await fileService.createFile(tenant, parsed);
        sendJson(res, 201, response);
        return;
      }

      // POST /v1/files/:id/complete -> Complete upload
      const completeMatch = pathname.match(/^\/v1\/files\/([^\/]+)\/complete$/);
      if (method === "POST" && completeMatch) {
        const fileId = completeMatch[1]!;
        const body = await parseJsonBody(req);
        const parsed = completeFileUploadRequestSchema.parse(body);
        const response = await fileService.completeUpload(
          tenant,
          fileId,
          parsed,
        );
        sendJson(res, 200, response);
        return;
      }

      // GET /v1/files/:id/download -> Get signed download URL
      const downloadMatch = pathname.match(/^\/v1\/files\/([^\/]+)\/download$/);
      if (method === "GET" && downloadMatch) {
        const fileId = downloadMatch[1]!;
        const response = await fileService.getDownloadUrl(tenant, fileId);
        sendJson(res, 200, response);
        return;
      }

      // GET /v1/files/:id/content -> Stream authenticated content
      const contentMatch = pathname.match(/^\/v1\/files\/([^\/]+)\/content$/);
      if (method === "GET" && contentMatch) {
        const fileId = contentMatch[1]!;
        const { body, file } = await fileService.getFileContentStream(
          tenant,
          fileId,
        );
        res.writeHead(200, {
          "content-type": file.detectedMimeType || file.mimeType,
          "content-disposition": `attachment; filename="${file.safeFileName}"`,
          "content-length": file.sizeBytes.toString(),
        });
        if (Buffer.isBuffer(body)) {
          res.end(body);
        } else {
          body.pipe(res);
        }
        return;
      }

      // GET /v1/files/:id -> Get file metadata
      const fileIdMatch = pathname.match(/^\/v1\/files\/([^\/]+)$/);
      if (method === "GET" && fileIdMatch) {
        const fileId = fileIdMatch[1]!;
        const file = await fileService.getFile(tenant, fileId);
        sendJson(res, 200, file);
        return;
      }

      // DELETE /v1/files/:id -> Delete file
      if (method === "DELETE" && fileIdMatch) {
        const fileId = fileIdMatch[1]!;
        await fileService.deleteFile(tenant, fileId);
        sendJson(res, 200, { deleted: true, id: fileId });
        return;
      }

      // GET /v1/files -> List files
      if (method === "GET" && pathname === "/v1/files") {
        const query = fileListQuerySchema.parse({
          purpose: url.searchParams.get("purpose") || undefined,
          status: url.searchParams.get("status") || undefined,
          workspaceId: url.searchParams.get("workspaceId") || undefined,
          cursor: url.searchParams.get("cursor") || undefined,
          limit: url.searchParams.get("limit")
            ? Number(url.searchParams.get("limit"))
            : undefined,
        });
        const result = await fileService.listFiles(tenant, query);
        sendJson(res, 200, result);
        return;
      }

      // Privileged /internal/files/:id/quarantine
      const quarantineMatch = pathname.match(
        /^\/internal\/files\/([^\/]+)\/quarantine$/,
      );
      if (method === "POST" && quarantineMatch) {
        const fileId = quarantineMatch[1]!;
        const body: any = await parseJsonBody(req);
        const updated = await fileService.quarantineFile(
          tenant.organizationId,
          fileId,
          body.reason || "Operator quarantined",
        );
        sendJson(res, 200, updated);
        return;
      }

      // Privileged /internal/files/:id/restore
      const restoreMatch = pathname.match(
        /^\/internal\/files\/([^\/]+)\/restore$/,
      );
      if (method === "POST" && restoreMatch) {
        const fileId = restoreMatch[1]!;
        const updated = await fileService.restoreFile(
          tenant.organizationId,
          fileId,
        );
        sendJson(res, 200, updated);
        return;
      }

      sendJson(res, 404, {
        error: { code: "NOT_FOUND", message: "Route not found" },
      });
    } catch (err: any) {
      if (err instanceof StorageError) {
        const status =
          err.code === "FILE_NOT_FOUND"
            ? 404
            : err.code === "UNAUTHORIZED_TENANT"
              ? 403
              : err.code === "FILE_QUARANTINED" ||
                  err.code === "DANGEROUS_FILE_REJECTED"
                ? 422
                : 400;
        sendJson(res, status, {
          error: { code: err.code, message: err.message, details: err.details },
        });
        return;
      }
      sendJson(res, 500, {
        error: { code: "INTERNAL_ERROR", message: err.message },
      });
    }
  });
}
