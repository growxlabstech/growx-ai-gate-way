import type {
  PlatformOperationalMode,
  CapabilityReadiness,
} from "@growx/contracts";
import { CapabilityDisabledError } from "./types.js";

export interface CapabilityFlags {
  textInference: boolean;
  fileInference: boolean;
  batch: boolean;
  billing: boolean;
  multimodal: boolean;
  providerOps: boolean;
}

export interface KillSwitches {
  allowNewBatchSubmissions: boolean;
  allowAsyncSubmissions: boolean;
  allowFileUploads: boolean;
  allowImageGeneration: boolean;
  allowSpeech: boolean;
  preserveFinalizationWorkers: boolean;
}

export class ReliabilityControlPlane {
  private mode: PlatformOperationalMode = "NORMAL";
  private capabilities: CapabilityFlags = {
    textInference: true,
    fileInference: true,
    batch: true,
    billing: true,
    multimodal: true,
    providerOps: true,
  };
  private killSwitches: KillSwitches = {
    allowNewBatchSubmissions: true,
    allowAsyncSubmissions: true,
    allowFileUploads: true,
    allowImageGeneration: true,
    allowSpeech: true,
    preserveFinalizationWorkers: true,
  };

  public getMode(): PlatformOperationalMode {
    return this.mode;
  }

  public setMode(mode: PlatformOperationalMode): void {
    this.mode = mode;
    if (mode === "READ_ONLY") {
      this.capabilities.batch = false;
      this.capabilities.providerOps = false;
      this.killSwitches.allowNewBatchSubmissions = false;
      this.killSwitches.allowAsyncSubmissions = false;
    } else if (mode === "MAINTENANCE") {
      this.capabilities.textInference = false;
      this.capabilities.fileInference = false;
      this.capabilities.batch = false;
      this.capabilities.billing = false;
      this.capabilities.multimodal = false;
      this.capabilities.providerOps = false;
    } else if (mode === "NORMAL") {
      this.capabilities = {
        textInference: true,
        fileInference: true,
        batch: true,
        billing: true,
        multimodal: true,
        providerOps: true,
      };
      this.killSwitches = {
        allowNewBatchSubmissions: true,
        allowAsyncSubmissions: true,
        allowFileUploads: true,
        allowImageGeneration: true,
        allowSpeech: true,
        preserveFinalizationWorkers: true,
      };
    }
  }

  public setCapability(cap: keyof CapabilityFlags, enabled: boolean): void {
    this.capabilities[cap] = enabled;
  }

  public setKillSwitch(sw: keyof KillSwitches, enabled: boolean): void {
    this.killSwitches[sw] = enabled;
  }

  public checkCapability(cap: keyof CapabilityFlags): void {
    if (this.mode === "MAINTENANCE") {
      throw new CapabilityDisabledError(cap, this.mode);
    }
    if (!this.capabilities[cap]) {
      throw new CapabilityDisabledError(cap, this.mode);
    }
  }

  public getCapabilityReadiness(): CapabilityReadiness {
    return {
      textInferenceReady: this.capabilities.textInference,
      fileInferenceReady: this.capabilities.fileInference,
      batchReady:
        this.capabilities.batch && this.killSwitches.allowNewBatchSubmissions,
      billingReady: this.capabilities.billing,
      multimodalReady: this.capabilities.multimodal,
      providerOpsReady: this.capabilities.providerOps,
      operationalMode: this.mode,
    };
  }

  public isHealthy(): boolean {
    return this.mode !== "MAINTENANCE";
  }

  public isReady(): boolean {
    return this.capabilities.textInference && this.mode !== "MAINTENANCE";
  }
}
