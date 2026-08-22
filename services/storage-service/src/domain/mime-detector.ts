import { FilePurpose, StorageError } from "./types.js";

export interface MimeDetectionResult {
  detectedMimeType: string;
  isExecutable: boolean;
  isArchive: boolean;
  category:
    "image" | "audio" | "video" | "document" | "code" | "data" | "binary";
}

const PURPOSE_ALLOWED_MIMES: Record<FilePurpose, string[]> = {
  ai_input: [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "audio/mpeg",
    "audio/wav",
    "audio/ogg",
    "audio/webm",
    "audio/mp4",
    "application/pdf",
    "text/plain",
    "text/csv",
    "application/json",
    "text/markdown",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
  image_input: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  audio_input: [
    "audio/mpeg",
    "audio/wav",
    "audio/ogg",
    "audio/webm",
    "audio/mp4",
    "audio/x-m4a",
  ],
  document_input: [
    "application/pdf",
    "text/plain",
    "text/csv",
    "application/json",
    "text/markdown",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
  batch_input: [
    "application/json",
    "text/plain",
    "application/x-ndjson",
    "text/csv",
    "application/jsonl",
    "application/jsonlines",
    "text/jsonl",
  ],
  batch_output: [
    "application/json",
    "text/plain",
    "application/x-ndjson",
    "text/csv",
    "application/jsonl",
    "application/jsonlines",
    "text/jsonl",
  ],
  invoice_document: ["application/pdf", "text/html"],
  generated_artifact: [
    "image/png",
    "image/jpeg",
    "image/webp",
    "audio/mpeg",
    "audio/wav",
    "application/pdf",
    "text/plain",
    "application/json",
  ],
  provider_transfer: [
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
    "audio/mpeg",
    "audio/wav",
    "text/plain",
    "application/json",
  ],
  internal: [
    "application/pdf",
    "text/plain",
    "application/json",
    "image/png",
    "image/jpeg",
    "text/html",
  ],
};

export class FileTypeDetector {
  public static detectMimeType(
    buffer: Buffer,
    declaredMime?: string,
  ): MimeDetectionResult {
    if (!buffer || buffer.length === 0) {
      return {
        detectedMimeType: declaredMime || "application/octet-stream",
        isExecutable: false,
        isArchive: false,
        category: "data",
      };
    }

    if (buffer.length >= 2 && buffer[0] === 0x4d && buffer[1] === 0x5a) {
      return {
        detectedMimeType: "application/x-dosexec",
        isExecutable: true,
        isArchive: false,
        category: "binary",
      };
    }
    if (
      buffer.length >= 4 &&
      buffer[0] === 0x7f &&
      buffer[1] === 0x45 &&
      buffer[2] === 0x4c &&
      buffer[3] === 0x46
    ) {
      return {
        detectedMimeType: "application/x-executable",
        isExecutable: true,
        isArchive: false,
        category: "binary",
      };
    }
    if (
      buffer.length >= 4 &&
      ((buffer[0] === 0xfe &&
        buffer[1] === 0xed &&
        buffer[2] === 0xfa &&
        buffer[3] === 0xce) ||
        (buffer[0] === 0xcf &&
          buffer[1] === 0xfa &&
          buffer[2] === 0xed &&
          buffer[3] === 0xfe) ||
        (buffer[0] === 0xca &&
          buffer[1] === 0xfe &&
          buffer[2] === 0xba &&
          buffer[3] === 0xbe))
    ) {
      return {
        detectedMimeType: "application/x-mach-binary",
        isExecutable: true,
        isArchive: false,
        category: "binary",
      };
    }

    if (
      buffer.length >= 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    ) {
      return {
        detectedMimeType: "image/png",
        isExecutable: false,
        isArchive: false,
        category: "image",
      };
    }

    if (
      buffer.length >= 3 &&
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff
    ) {
      return {
        detectedMimeType: "image/jpeg",
        isExecutable: false,
        isArchive: false,
        category: "image",
      };
    }

    if (
      buffer.length >= 6 &&
      buffer[0] === 0x47 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x38 &&
      (buffer[4] === 0x37 || buffer[4] === 0x39) &&
      buffer[5] === 0x61
    ) {
      return {
        detectedMimeType: "image/gif",
        isExecutable: false,
        isArchive: false,
        category: "image",
      };
    }

    if (
      buffer.length >= 12 &&
      buffer[0] === 0x52 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x46 &&
      buffer[8] === 0x57 &&
      buffer[9] === 0x41 &&
      buffer[10] === 0x42 &&
      buffer[11] === 0x50
    ) {
      return {
        detectedMimeType: "image/webp",
        isExecutable: false,
        isArchive: false,
        category: "image",
      };
    }

    if (
      buffer.length >= 5 &&
      buffer[0] === 0x25 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x44 &&
      buffer[3] === 0x46 &&
      buffer[4] === 0x2d
    ) {
      return {
        detectedMimeType: "application/pdf",
        isExecutable: false,
        isArchive: false,
        category: "document",
      };
    }

    if (
      buffer.length >= 3 &&
      ((buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) ||
        (buffer[0] === 0xff && ((buffer[1] ?? 0) & 0xe0) === 0xe0))
    ) {
      return {
        detectedMimeType: "audio/mpeg",
        isExecutable: false,
        isArchive: false,
        category: "audio",
      };
    }

    if (
      buffer.length >= 12 &&
      buffer[0] === 0x52 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x46 &&
      buffer[8] === 0x57 &&
      buffer[9] === 0x41 &&
      buffer[10] === 0x56 &&
      buffer[11] === 0x45
    ) {
      return {
        detectedMimeType: "audio/wav",
        isExecutable: false,
        isArchive: false,
        category: "audio",
      };
    }

    if (
      buffer.length >= 4 &&
      buffer[0] === 0x4f &&
      buffer[1] === 0x67 &&
      buffer[2] === 0x67 &&
      buffer[3] === 0x53
    ) {
      return {
        detectedMimeType: "audio/ogg",
        isExecutable: false,
        isArchive: false,
        category: "audio",
      };
    }

    if (
      buffer.length >= 4 &&
      buffer[0] === 0x50 &&
      buffer[1] === 0x4b &&
      buffer[2] === 0x03 &&
      buffer[3] === 0x04
    ) {
      return {
        detectedMimeType: "application/zip",
        isExecutable: false,
        isArchive: true,
        category: "binary",
      };
    }

    const textSample = buffer
      .slice(0, Math.min(buffer.length, 1024))
      .toString("utf8");
    const isPrintable = /^[\s\x20-\x7E\p{L}\p{N}\p{P}\p{S}]*$/u.test(
      textSample,
    );

    if (isPrintable) {
      const trimmed = textSample.trim();
      if (
        (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
        (trimmed.startsWith("[") && trimmed.endsWith("]"))
      ) {
        return {
          detectedMimeType: "application/json",
          isExecutable: false,
          isArchive: false,
          category: "data",
        };
      }
      if (trimmed.startsWith("<!DOCTYPE html") || trimmed.startsWith("<html")) {
        return {
          detectedMimeType: "text/html",
          isExecutable: false,
          isArchive: false,
          category: "document",
        };
      }
      return {
        detectedMimeType: declaredMime || "text/plain",
        isExecutable: false,
        isArchive: false,
        category: "document",
      };
    }

    return {
      detectedMimeType: declaredMime || "application/octet-stream",
      isExecutable: false,
      isArchive: false,
      category: "binary",
    };
  }

  public static validatePurposeMime(
    purpose: FilePurpose,
    mimeType: string,
  ): boolean {
    const allowed = PURPOSE_ALLOWED_MIMES[purpose];
    if (!allowed) return false;
    const normalized = (mimeType.toLowerCase().split(";")[0] ?? "").trim();
    return allowed.includes(normalized);
  }

  public static enforceMimeSafety(params: {
    purpose: FilePurpose;
    declaredMime: string;
    detected: MimeDetectionResult;
  }): void {
    const { purpose, declaredMime, detected } = params;

    if (detected.isExecutable) {
      throw new StorageError(
        "DANGEROUS_FILE_REJECTED",
        "Executable binaries are strictly prohibited",
      );
    }

    if (detected.isArchive) {
      throw new StorageError(
        "UNSUPPORTED_MIME_TYPE",
        "Archive files (ZIP/TAR) are disabled by default",
      );
    }

    if (!this.validatePurposeMime(purpose, detected.detectedMimeType)) {
      throw new StorageError(
        "UNSUPPORTED_MIME_TYPE",
        `File MIME type ${detected.detectedMimeType} is not permitted for purpose ${purpose}`,
      );
    }

    const decNorm = (declaredMime.toLowerCase().split(";")[0] ?? "").trim();
    const detNorm = (
      detected.detectedMimeType.toLowerCase().split(";")[0] ?? ""
    ).trim();

    const isImageMismatch =
      decNorm.startsWith("image/") !== detNorm.startsWith("image/");
    const isAudioMismatch =
      decNorm.startsWith("audio/") !== detNorm.startsWith("audio/");
    const isPdfMismatch =
      (decNorm === "application/pdf") !== (detNorm === "application/pdf");

    if (isImageMismatch || isAudioMismatch || isPdfMismatch) {
      throw new StorageError(
        "MIME_TYPE_MISMATCH",
        `Declared MIME type '${declaredMime}' dangerously contradicts detected content type '${detected.detectedMimeType}'`,
      );
    }
  }
}
