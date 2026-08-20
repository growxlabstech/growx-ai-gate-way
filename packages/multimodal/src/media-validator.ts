import { MediaValidationError, PixelBombError } from "./types.js";

export const DEFAULT_ALLOWED_IMAGE_MIMES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
];

export const DEFAULT_ALLOWED_AUDIO_MIMES = [
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "audio/flac",
  "audio/x-flac",
  "audio/m4a",
  "audio/mp4",
  "audio/webm",
];

export const MAX_SAFE_PIXEL_COUNT = 64_000_000; // 64 Megapixels (e.g. 8000x8000)
export const MAX_SAFE_IMAGE_DIMENSION = 16_384;
export const MAX_SAFE_IMAGE_BYTES = 20 * 1024 * 1024; // 20 MB
export const MAX_SAFE_AUDIO_BYTES = 25 * 1024 * 1024; // 25 MB
export const MAX_SAFE_AUDIO_DURATION_SECONDS = 3600; // 1 hour

export class MediaValidator {
  public static validateImageMime(
    mimeType: string,
    allowedMimes: readonly string[] = DEFAULT_ALLOWED_IMAGE_MIMES
  ): void {
    const normalized = mimeType.toLowerCase().trim();
    if (!allowedMimes.includes(normalized)) {
      throw new MediaValidationError(
        "UNSUPPORTED_IMAGE_MIME",
        `Image MIME type '${mimeType}' is not allowed. Allowed types: [${allowedMimes.join(", ")}]`
      );
    }
  }

  public static validateImageDimensions(
    width: number,
    height: number,
    maxPixels: number = MAX_SAFE_PIXEL_COUNT
  ): void {
    if (width <= 0 || height <= 0) {
      throw new MediaValidationError(
        "INVALID_IMAGE_DIMENSIONS",
        `Image dimensions must be positive integers: width=${width}, height=${height}`
      );
    }

    if (width > MAX_SAFE_IMAGE_DIMENSION || height > MAX_SAFE_IMAGE_DIMENSION) {
      throw new MediaValidationError(
        "IMAGE_DIMENSION_EXCEEDED",
        `Image dimension (${width}x${height}) exceeds maximum dimension of ${MAX_SAFE_IMAGE_DIMENSION}px`
      );
    }

    const totalPixels = width * height;
    if (totalPixels > maxPixels) {
      throw new PixelBombError(width, height, totalPixels, maxPixels);
    }
  }

  public static validateAudioMime(
    mimeType: string,
    allowedMimes: readonly string[] = DEFAULT_ALLOWED_AUDIO_MIMES
  ): void {
    const normalized = mimeType.toLowerCase().trim();
    if (!allowedMimes.includes(normalized)) {
      throw new MediaValidationError(
        "UNSUPPORTED_AUDIO_MIME",
        `Audio MIME type '${mimeType}' is not allowed. Allowed types: [${allowedMimes.join(", ")}]`
      );
    }
  }

  public static validateAudioDuration(
    durationSeconds: number,
    maxSeconds: number = MAX_SAFE_AUDIO_DURATION_SECONDS
  ): void {
    if (durationSeconds < 0) {
      throw new MediaValidationError(
        "NEGATIVE_AUDIO_DURATION",
        `Audio duration cannot be negative: ${durationSeconds}s`
      );
    }
    if (durationSeconds > maxSeconds) {
      throw new MediaValidationError(
        "AUDIO_DURATION_EXCEEDED",
        `Audio duration (${durationSeconds}s) exceeds maximum allowed duration of ${maxSeconds}s`
      );
    }
  }

  public static validateBase64DataUri(
    dataUri: string,
    maxBytes: number = MAX_SAFE_IMAGE_BYTES
  ): { mimeType: string; byteLength: number } {
    if (!dataUri.startsWith("data:")) {
      throw new MediaValidationError("INVALID_DATA_URI", "Data URI must start with 'data:'");
    }

    const commaIdx = dataUri.indexOf(",");
    if (commaIdx === -1) {
      throw new MediaValidationError("MALFORMED_DATA_URI", "Data URI is missing comma separator");
    }

    const metadataPart = dataUri.slice(5, commaIdx);
    const base64Data = dataUri.slice(commaIdx + 1);

    const isBase64 = metadataPart.includes(";base64");
    if (!isBase64) {
      throw new MediaValidationError("DATA_URI_NOT_BASE64", "Data URI must use base64 encoding");
    }

    const mimeType = metadataPart.split(";")[0]?.toLowerCase().trim() || "application/octet-stream";
    
    // Approximate decoded size from base64 length
    const padding = (base64Data.endsWith("==") ? 2 : base64Data.endsWith("=") ? 1 : 0);
    const byteLength = Math.floor((base64Data.length * 3) / 4) - padding;

    if (byteLength > maxBytes) {
      throw new MediaValidationError(
        "MEDIA_SIZE_EXCEEDED",
        `Inline media size (${byteLength} bytes) exceeds limit of ${maxBytes} bytes`
      );
    }

    return { mimeType, byteLength };
  }
}
