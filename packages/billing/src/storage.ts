export interface BillingDocumentStorage {
  put(
    key: string,
    content: Buffer | string,
    contentType?: string,
  ): Promise<{ storageKey: string; byteSize: number }>;
  get(
    key: string,
  ): Promise<{ content: Buffer; contentType: string } | undefined>;
  getSignedUrl(key: string, expiresInSeconds?: number): Promise<string>;
}

export interface MinimalObjectStorageProvider {
  putObject(
    key: string,
    data: Buffer | Uint8Array,
    options?: { contentType?: string },
  ): Promise<{ contentLength: number }>;
  getObject(
    key: string,
  ): Promise<{ body: Buffer | any; metadata: { contentType: string } }>;
  createSignedDownloadUrl(
    key: string,
    options?: { expiresInSeconds?: number },
  ): Promise<{ downloadUrl: string }>;
}

export class ObjectStorageBillingDocumentAdapter implements BillingDocumentStorage {
  constructor(private readonly provider: MinimalObjectStorageProvider) {}

  async put(
    key: string,
    content: Buffer | string,
    contentType = "text/html",
  ): Promise<{ storageKey: string; byteSize: number }> {
    const buf = Buffer.isBuffer(content)
      ? content
      : Buffer.from(content, "utf8");
    const meta = await this.provider.putObject(key, buf, { contentType });
    return {
      storageKey: key,
      byteSize: meta.contentLength,
    };
  }

  async get(
    key: string,
  ): Promise<{ content: Buffer; contentType: string } | undefined> {
    try {
      const res = await this.provider.getObject(key);
      let buf: Buffer;
      if (Buffer.isBuffer(res.body)) {
        buf = res.body;
      } else {
        const chunks: Buffer[] = [];
        for await (const chunk of res.body) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        buf = Buffer.concat(chunks);
      }
      return { content: buf, contentType: res.metadata.contentType };
    } catch {
      return undefined;
    }
  }

  async getSignedUrl(key: string, expiresInSeconds = 3600): Promise<string> {
    const res = await this.provider.createSignedDownloadUrl(key, {
      expiresInSeconds,
    });
    return res.downloadUrl;
  }
}

export class InMemoryBillingDocumentStorage implements BillingDocumentStorage {
  private readonly files = new Map<
    string,
    { content: Buffer; contentType: string }
  >();

  async put(
    key: string,
    content: Buffer | string,
    contentType = "text/html",
  ): Promise<{ storageKey: string; byteSize: number }> {
    const buf = Buffer.isBuffer(content)
      ? content
      : Buffer.from(content, "utf8");
    this.files.set(key, { content: buf, contentType });
    return {
      storageKey: key,
      byteSize: buf.length,
    };
  }

  async get(
    key: string,
  ): Promise<{ content: Buffer; contentType: string } | undefined> {
    return this.files.get(key);
  }

  async getSignedUrl(key: string, _expiresInSeconds = 3600): Promise<string> {
    if (!this.files.has(key)) {
      throw new Error(`Document not found for key: ${key}`);
    }
    // Return authenticated signed mock URL
    return `https://storage.growx.internal/documents/${key}?signature=sig_${Date.now()}`;
  }
}
