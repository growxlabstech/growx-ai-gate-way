import type { ModelCapability } from "@growx/contracts";
export * from "./domain/types.js";
export * from "./domain/lifecycle.js";
export * from "./domain/resolver.js";
export * from "./domain/api-key-matcher.js";
export * from "./domain/serializers.js";
export * from "./application/repository.js";
export * from "./application/events.js";
export * from "./application/model-registry-service.js";
export * from "./infrastructure/in-memory-repository.js";
export * from "./infrastructure/database-repository.js";
export * from "./infrastructure/events.js";
export * from "./transport/privileged-auth.js";
export * from "./transport/customer-auth.js";
export * from "./transport/http-routes.js";

export type ModelStatus = "active" | "preview" | "beta" | "deprecated" | "disabled" | "unavailable";
export interface ModelRecord {
  id: string;
  providerId: string;
  providerModelId: string;
  publicModelId: string;
  displayName: string;
  description: string;
  status: ModelStatus;
  contextWindow: number;
  maxOutputTokens: number;
  capabilities: ReadonlySet<ModelCapability>;
  createdAt: Date;
  updatedAt: Date;
}
export interface AliasVersion {
  alias: string;
  version: string;
  targets: readonly string[];
  effectiveFrom: Date;
  effectiveUntil: Date | null;
  status: "active" | "inactive";
}
export class ModelRegistry {
  constructor(private readonly models: readonly ModelRecord[], private readonly aliases: readonly AliasVersion[]) {}
  list(): readonly ModelRecord[] {
    return this.models.filter((model) => ["active", "preview", "beta", "deprecated"].includes(model.status));
  }
  resolve(requested: string, now = new Date()): readonly ModelRecord[] {
    const alias = this.aliases
      .filter((value) => value.alias === requested && value.status === "active" && value.effectiveFrom <= now && (!value.effectiveUntil || value.effectiveUntil > now))
      .sort((a, b) => b.version.localeCompare(a.version))[0];
    const ids = alias?.targets ?? [requested];
    return ids
      .map((id) => this.models.find((model) => model.publicModelId === id))
      .filter((model): model is ModelRecord => Boolean(model && !["disabled", "unavailable"].includes(model.status)));
  }
  requireCapabilities(model: ModelRecord, required: readonly ModelCapability[]): void {
    const missing = required.filter((capability) => !model.capabilities.has(capability));
    if (missing.length) {
      throw Object.assign(new Error(`Model does not support: ${missing.join(", ")}`), { code: "model_capability_not_supported" });
    }
  }
}
