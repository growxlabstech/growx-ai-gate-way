import {
  FileObject,
  FileUploadSession,
  ProviderFileReference,
  FileUsageReference,
  FileStorageReservation,
  FileRetentionPolicy,
  TenantContext,
  StorageError,
} from "../domain/types.js";

export interface FileFilter {
  organizationId: string;
  workspaceId?: string | null | undefined;
  purpose?: string | undefined;
  status?: string | undefined;
  cursor?: string | undefined;
  limit?: number | undefined;
}

export interface FileRepository {
  createFile(file: FileObject): Promise<FileObject>;
  getFile(organizationId: string, fileId: string): Promise<FileObject | null>;
  getFileByStorageKey(storageKey: string): Promise<FileObject | null>;
  updateFile(file: FileObject): Promise<FileObject>;
  deleteFile(organizationId: string, fileId: string): Promise<boolean>;
  listFiles(filter: FileFilter): Promise<{ data: FileObject[]; nextCursor: string | null; hasMore: boolean }>;

  createUploadSession(session: FileUploadSession): Promise<FileUploadSession>;
  getUploadSession(organizationId: string, sessionId: string): Promise<FileUploadSession | null>;
  updateUploadSession(session: FileUploadSession): Promise<FileUploadSession>;

  createProviderReference(ref: ProviderFileReference): Promise<ProviderFileReference>;
  getProviderReference(fileId: string, providerId: string, credentialId?: string | null): Promise<ProviderFileReference | null>;
  deleteProviderReferences(fileId: string): Promise<number>;

  createUsageReference(ref: FileUsageReference): Promise<FileUsageReference>;
  getUsageReferences(fileId: string): Promise<FileUsageReference[]>;

  createStorageReservation(res: FileStorageReservation): Promise<FileStorageReservation>;
  deleteStorageReservation(fileId: string): Promise<boolean>;
  getActiveReservations(organizationId: string): Promise<FileStorageReservation[]>;

  getRetentionPolicy(organizationId: string | null, purpose: string): Promise<FileRetentionPolicy | null>;
  setRetentionPolicy(policy: FileRetentionPolicy): Promise<FileRetentionPolicy>;
  getExpiredFiles(now: Date, limit: number): Promise<FileObject[]>;
  getExpiredUploadSessions(now: Date, limit: number): Promise<FileUploadSession[]>;
  getStorageUsage(organizationId: string): Promise<{ totalBytes: bigint; fileCount: number }>;
}

export class InMemoryFileRepository implements FileRepository {
  private readonly files = new Map<string, FileObject>();
  private readonly sessions = new Map<string, FileUploadSession>();
  private readonly providerRefs = new Map<string, ProviderFileReference>();
  private readonly usageRefs = new Map<string, FileUsageReference[]>();
  private readonly reservations = new Map<string, FileStorageReservation>();
  private readonly retentionPolicies = new Map<string, FileRetentionPolicy>();

  async createFile(file: FileObject): Promise<FileObject> {
    this.files.set(file.id, { ...file });
    return file;
  }

  async getFile(organizationId: string, fileId: string): Promise<FileObject | null> {
    const file = this.files.get(fileId);
    if (!file) return null;
    if (file.organizationId !== organizationId) return null;
    return { ...file };
  }

  async getFileByStorageKey(storageKey: string): Promise<FileObject | null> {
    for (const f of this.files.values()) {
      if (f.storageKey === storageKey) return { ...f };
    }
    return null;
  }

  async updateFile(file: FileObject): Promise<FileObject> {
    if (!this.files.has(file.id)) {
      throw new StorageError("FILE_NOT_FOUND", `File ${file.id} not found`);
    }
    this.files.set(file.id, { ...file, updatedAt: new Date() });
    return { ...file };
  }

  async deleteFile(organizationId: string, fileId: string): Promise<boolean> {
    const file = this.files.get(fileId);
    if (!file || file.organizationId !== organizationId) return false;
    file.status = "deleted";
    file.deletedAt = new Date();
    file.updatedAt = new Date();
    return true;
  }

  async listFiles(filter: FileFilter): Promise<{ data: FileObject[]; nextCursor: string | null; hasMore: boolean }> {
    const limit = filter.limit || 20;
    const all = Array.from(this.files.values()).filter((f) => {
      if (f.organizationId !== filter.organizationId) return false;
      if (filter.workspaceId && f.workspaceId !== filter.workspaceId) return false;
      if (filter.purpose && f.purpose !== filter.purpose) return false;
      if (filter.status && f.status !== filter.status) return false;
      if (!filter.status && f.status === "deleted") return false;
      return true;
    });

    all.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const startIndex = filter.cursor ? all.findIndex((f) => f.id === filter.cursor) + 1 : 0;
    const slice = all.slice(startIndex, startIndex + limit);
    const nextCursor = slice.length === limit && startIndex + limit < all.length ? slice[slice.length - 1]!.id : null;

    return {
      data: slice.map((f) => ({ ...f })),
      nextCursor,
      hasMore: nextCursor !== null,
    };
  }

  async createUploadSession(session: FileUploadSession): Promise<FileUploadSession> {
    this.sessions.set(session.id, { ...session });
    return session;
  }

  async getUploadSession(organizationId: string, sessionId: string): Promise<FileUploadSession | null> {
    const s = this.sessions.get(sessionId);
    if (!s || s.organizationId !== organizationId) return null;
    return { ...s };
  }

  async updateUploadSession(session: FileUploadSession): Promise<FileUploadSession> {
    this.sessions.set(session.id, { ...session, updatedAt: new Date() });
    return { ...session };
  }

  async createProviderReference(ref: ProviderFileReference): Promise<ProviderFileReference> {
    const key = `${ref.fileId}_${ref.providerId}_${ref.providerCredentialId || "default"}`;
    this.providerRefs.set(key, { ...ref });
    return ref;
  }

  async getProviderReference(fileId: string, providerId: string, credentialId?: string | null): Promise<ProviderFileReference | null> {
    const key = `${fileId}_${providerId}_${credentialId || "default"}`;
    const ref = this.providerRefs.get(key);
    return ref ? { ...ref } : null;
  }

  async deleteProviderReferences(fileId: string): Promise<number> {
    let count = 0;
    for (const [k, v] of this.providerRefs.entries()) {
      if (v.fileId === fileId) {
        this.providerRefs.delete(k);
        count++;
      }
    }
    return count;
  }

  async createUsageReference(ref: FileUsageReference): Promise<FileUsageReference> {
    const list = this.usageRefs.get(ref.fileId) || [];
    list.push({ ...ref });
    this.usageRefs.set(ref.fileId, list);
    return ref;
  }

  async getUsageReferences(fileId: string): Promise<FileUsageReference[]> {
    return this.usageRefs.get(fileId) || [];
  }

  async createStorageReservation(res: FileStorageReservation): Promise<FileStorageReservation> {
    this.reservations.set(res.fileId, { ...res });
    return res;
  }

  async deleteStorageReservation(fileId: string): Promise<boolean> {
    return this.reservations.delete(fileId);
  }

  async getActiveReservations(organizationId: string): Promise<FileStorageReservation[]> {
    const now = new Date();
    return Array.from(this.reservations.values()).filter(
      (r) => r.organizationId === organizationId && r.expiresAt > now
    );
  }

  async getRetentionPolicy(organizationId: string | null, purpose: string): Promise<FileRetentionPolicy | null> {
    const key = `${organizationId || "global"}_${purpose}`;
    return this.retentionPolicies.get(key) || null;
  }

  async setRetentionPolicy(policy: FileRetentionPolicy): Promise<FileRetentionPolicy> {
    const key = `${policy.organizationId || "global"}_${policy.purpose}`;
    this.retentionPolicies.set(key, { ...policy });
    return policy;
  }

  async getExpiredFiles(now: Date, limit: number): Promise<FileObject[]> {
    const expired: FileObject[] = [];
    for (const f of this.files.values()) {
      if (f.status !== "deleted" && f.status !== "expired" && f.expiresAt && f.expiresAt <= now) {
        expired.push({ ...f });
        if (expired.length >= limit) break;
      }
    }
    return expired;
  }

  async getExpiredUploadSessions(now: Date, limit: number): Promise<FileUploadSession[]> {
    const expired: FileUploadSession[] = [];
    for (const s of this.sessions.values()) {
      if (s.status === "pending" && s.expiresAt <= now) {
        expired.push({ ...s });
        if (expired.length >= limit) break;
      }
    }
    return expired;
  }

  async getStorageUsage(organizationId: string): Promise<{ totalBytes: bigint; fileCount: number }> {
    let total = 0n;
    let count = 0;
    for (const f of this.files.values()) {
      if (f.organizationId === organizationId && f.status === "ready") {
        total += BigInt(f.sizeBytes);
        count++;
      }
    }
    return { totalBytes: total, fileCount: count };
  }

  public clear(): void {
    this.files.clear();
    this.sessions.clear();
    this.providerRefs.clear();
    this.usageRefs.clear();
    this.reservations.clear();
    this.retentionPolicies.clear();
  }
}
