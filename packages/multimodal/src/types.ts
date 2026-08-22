export class MediaValidationError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "MediaValidationError";
  }
}

export class PixelBombError extends Error {
  constructor(
    public width: number,
    public height: number,
    public totalPixels: number,
    public maxAllowed: number,
  ) {
    super(
      `Pixel count ${totalPixels} (${width}x${height}) exceeds safety limit of ${maxAllowed} pixels`,
    );
    this.name = "PixelBombError";
  }
}

export class VoiceUnsupportedError extends Error {
  constructor(
    public voice: string,
    public allowedVoices: string[],
  ) {
    super(
      `Voice '${voice}' is unsupported. Supported voices: [${allowedVoices.join(", ")}]`,
    );
    this.name = "VoiceUnsupportedError";
  }
}

export class ModalityNotSupportedError extends Error {
  constructor(
    public modality: string,
    public model: string,
  ) {
    super(`Modality '${modality}' is not supported by model '${model}'`);
    this.name = "ModalityNotSupportedError";
  }
}

export class MediaCrossTenantError extends Error {
  constructor(
    public fileId: string,
    public organizationId: string,
  ) {
    super(
      `Access denied: File '${fileId}' does not belong to organization '${organizationId}'`,
    );
    this.name = "MediaCrossTenantError";
  }
}

export class MediaStorageError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "MediaStorageError";
  }
}
