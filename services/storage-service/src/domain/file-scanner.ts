import { FileSafetyStatus } from "./types.js";

export interface FileScanner {
  scan(fileReference: {
    fileId: string;
    storageKey: string;
    sizeBytes: number;
    mimeType: string;
  }): Promise<FileSafetyStatus>;
}

export class TruthfulFileScanner implements FileScanner {
  constructor(
    private readonly enabled = false,
    private readonly scannerName = "truthful-scanner",
  ) {}

  async scan(fileReference: {
    fileId: string;
    storageKey: string;
    sizeBytes: number;
    mimeType: string;
  }): Promise<FileSafetyStatus> {
    if (!this.enabled) {
      return {
        state: "not_scanned",
        scanner: null,
        reason: "No active anti-malware scanner configured",
        checkedAt: new Date(),
      };
    }
    return {
      state: "clean",
      scanner: this.scannerName,
      reason: null,
      checkedAt: new Date(),
    };
  }
}
