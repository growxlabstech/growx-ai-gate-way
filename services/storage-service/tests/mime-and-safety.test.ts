import { describe, it, expect } from "vitest";
import { FileTypeDetector } from "../src/domain/mime-detector.js";
import { sanitizeFileName, generateStorageKey, validatePathSafety } from "../src/domain/storage-key.js";
import { TruthfulFileScanner } from "../src/domain/file-scanner.js";

describe("Phase 25: MIME & File Security Controls", () => {
  it("1. Accurately sniffs magic bytes for PNG, JPEG, PDF, MP3, and JSON", () => {
    const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
    expect(FileTypeDetector.detectMimeType(pngHeader).detectedMimeType).toBe("image/png");

    const jpegHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    expect(FileTypeDetector.detectMimeType(jpegHeader).detectedMimeType).toBe("image/jpeg");

    const pdfHeader = Buffer.from("%PDF-1.7 header content here");
    expect(FileTypeDetector.detectMimeType(pdfHeader).detectedMimeType).toBe("application/pdf");

    const mp3Header = Buffer.from([0x49, 0x44, 0x33, 0x03, 0x00, 0x00]);
    expect(FileTypeDetector.detectMimeType(mp3Header).detectedMimeType).toBe("audio/mpeg");

    const jsonHeader = Buffer.from('{"key": "value", "numbers": [1,2,3]}');
    expect(FileTypeDetector.detectMimeType(jsonHeader).detectedMimeType).toBe("application/json");
  });

  it("2. Strictly rejects executable binaries (PE, ELF, Mach-O)", () => {
    const peHeader = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00]);
    const peRes = FileTypeDetector.detectMimeType(peHeader);
    expect(peRes.isExecutable).toBe(true);

    expect(() => {
      FileTypeDetector.enforceMimeSafety({
        purpose: "ai_input",
        declaredMime: "application/pdf",
        detected: peRes,
      });
    }).toThrowError(/Executable binaries are strictly prohibited/);

    const elfHeader = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01]);
    const elfRes = FileTypeDetector.detectMimeType(elfHeader);
    expect(elfRes.isExecutable).toBe(true);
  });

  it("3. Strictly rejects archive files (ZIP) by default", () => {
    const zipHeader = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
    const zipRes = FileTypeDetector.detectMimeType(zipHeader);
    expect(zipRes.isArchive).toBe(true);

    expect(() => {
      FileTypeDetector.enforceMimeSafety({
        purpose: "ai_input",
        declaredMime: "application/zip",
        detected: zipRes,
      });
    }).toThrowError(/Archive files.*are disabled by default/);
  });

  it("4. Detects dangerous declared vs detected MIME type mismatches", () => {
    const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const detected = FileTypeDetector.detectMimeType(pngHeader);

    expect(() => {
      FileTypeDetector.enforceMimeSafety({
        purpose: "ai_input",
        declaredMime: "text/plain",
        detected,
      });
    }).toThrowError(/Declared MIME type.*dangerously contradicts detected content type/);
  });

  it("5. Sanitizes filenames and prevents path traversal attacks", () => {
    expect(sanitizeFileName("../../../etc/passwd")).toBe("passwd");
    expect(sanitizeFileName("..\\windows\\system32\\cmd.exe")).toBe("cmd.exe");
    expect(sanitizeFileName("report (2026) [final]!.pdf")).toBe("report__2026___final__.pdf");

    expect(validatePathSafety("org/123/workspace/ws1/files/f1/content")).toBe(true);
    expect(validatePathSafety("org/123/../../etc/passwd")).toBe(false);
  });

  it("6. Generates opaque, server-controlled storage keys", () => {
    const key = generateStorageKey({
      organizationId: "org_alpha",
      workspaceId: "ws_prod",
      fileId: "file_999",
      safeFileName: "invoice.pdf",
    });
    expect(key).toBe("org/org_alpha/workspace/ws_ws_prod/files/file_999/content");
    expect(key.includes("invoice.pdf")).toBe(false);
  });

  it("7. Truthful file scanner preserves safety state truthfully", async () => {
    const scanner = new TruthfulFileScanner(false);
    const res = await scanner.scan({
      fileId: "file_1",
      storageKey: "key",
      sizeBytes: 100,
      mimeType: "image/png",
    });
    expect(res.state).toBe("not_scanned");
    expect(res.reason).toContain("No active anti-malware scanner configured");
  });
});
