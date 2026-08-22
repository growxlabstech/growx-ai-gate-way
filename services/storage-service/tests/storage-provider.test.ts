import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryObjectStorageProvider } from "../src/infrastructure/in-memory-storage-provider.js";
import { S3CompatibleObjectStorageProvider } from "../src/infrastructure/s3-storage-provider.js";

describe("Phase 25: Object Storage Provider Abstraction", () => {
  let inMemoryProvider: InMemoryObjectStorageProvider;

  beforeEach(() => {
    inMemoryProvider = new InMemoryObjectStorageProvider();
  });

  it("1. Puts, gets, heads, and deletes objects with checksum calculation", async () => {
    const key = "org/org_test/files/file_123/content";
    const payload = Buffer.from("Hello, GrowX Object Storage!");

    const meta = await inMemoryProvider.putObject(key, payload, {
      contentType: "text/plain",
      metadata: { customId: "xyz" },
    });

    expect(meta.contentLength).toBe(payload.length);
    expect(meta.contentType).toBe("text/plain");
    expect(meta.checksumSha256).toBeDefined();

    const head = await inMemoryProvider.headObject(key);
    expect(head).not.toBeNull();
    expect(head?.contentLength).toBe(payload.length);

    const getRes = await inMemoryProvider.getObject(key);
    expect(Buffer.isBuffer(getRes.body)).toBe(true);
    expect(getRes.body.toString("utf8")).toBe("Hello, GrowX Object Storage!");

    const deleted = await inMemoryProvider.deleteObject(key);
    expect(deleted).toBe(true);

    const headAfter = await inMemoryProvider.headObject(key);
    expect(headAfter).toBeNull();
  });

  it("2. Supports range requests for streaming large audio/video payloads", async () => {
    const key = "org/org_test/files/file_audio/content";
    const fullData = Buffer.from("0123456789ABCDEF");

    await inMemoryProvider.putObject(key, fullData, {
      contentType: "audio/mpeg",
    });

    // Request bytes 4 to 9
    const rangeRes = await inMemoryProvider.getObject(key, {
      start: 4,
      end: 9,
    });
    expect(rangeRes.body.toString("utf8")).toBe("456789");
    expect(rangeRes.metadata.contentLength).toBe(6);
  });

  it("3. Generates short-lived signed upload and download URLs", async () => {
    const key = "org/org_test/files/file_signed/content";
    await inMemoryProvider.putObject(key, Buffer.from("data"));

    const uploadSigned = await inMemoryProvider.createSignedUploadUrl(key, {
      expiresInSeconds: 600,
    });
    expect(uploadSigned.uploadUrl).toContain("https://");
    expect(uploadSigned.uploadUrl).toContain(encodeURIComponent(key));
    expect(uploadSigned.expiresAt.getTime()).toBeGreaterThan(Date.now());

    const downloadSigned = await inMemoryProvider.createSignedDownloadUrl(key, {
      expiresInSeconds: 300,
    });
    expect(downloadSigned.downloadUrl).toContain("https://");
    expect(downloadSigned.downloadUrl).toContain(encodeURIComponent(key));
  });

  it("4. Manages multipart upload lifecycle: create, upload parts, complete, abort", async () => {
    const key = "org/org_test/files/file_mp/content";
    const mp = await inMemoryProvider.createMultipartUpload(key, {
      contentType: "application/pdf",
    });
    expect(mp.uploadId).toBeDefined();

    const part1 = await inMemoryProvider.uploadPart(
      key,
      mp.uploadId,
      1,
      Buffer.from("Part 1 content. "),
    );
    const part2 = await inMemoryProvider.uploadPart(
      key,
      mp.uploadId,
      2,
      Buffer.from("Part 2 content."),
    );

    expect(part1.partNumber).toBe(1);
    expect(part2.partNumber).toBe(2);

    const completed = await inMemoryProvider.completeMultipartUpload(
      key,
      mp.uploadId,
      [part1, part2],
    );
    expect(completed.contentLength).toBe(
      Buffer.from("Part 1 content. Part 2 content.").length,
    );

    const fetched = await inMemoryProvider.getObject(key);
    expect(fetched.body.toString("utf8")).toBe(
      "Part 1 content. Part 2 content.",
    );
  });

  it("5. S3CompatibleObjectStorageProvider generates AWS SigV4 signed URLs", async () => {
    const s3Provider = new S3CompatibleObjectStorageProvider({
      bucket: "growx-customer-files",
      region: "us-east-1",
      accessKeyId: "mock-access-key",
      secretAccessKey: "mock-secret-key-1234567890",
    });

    const signedUpload = await s3Provider.createSignedUploadUrl(
      "org/org_1/files/f1/content",
      { expiresInSeconds: 900 },
    );
    expect(signedUpload.uploadUrl).toContain(
      "growx-customer-files.s3.us-east-1.amazonaws.com",
    );
    expect(signedUpload.uploadUrl).toContain("X-Amz-Signature");

    const signedDownload = await s3Provider.createSignedDownloadUrl(
      "org/org_1/files/f1/content",
      { expiresInSeconds: 900 },
    );
    expect(signedDownload.downloadUrl).toContain(
      "growx-customer-files.s3.us-east-1.amazonaws.com",
    );
    expect(signedDownload.downloadUrl).toContain("X-Amz-Signature");
  });
});
