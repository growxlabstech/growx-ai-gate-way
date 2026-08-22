import type {
  AIProviderAdapter,
  ProviderHealthState,
} from "@growx/provider-sdk";
export type ProviderStatus =
  "active" | "degraded" | "maintenance" | "disabled" | "unavailable";
export interface ProviderRecord {
  id: string;
  name: string;
  slug: string;
  status: ProviderStatus;
  adapterType: string;
  baseUrl: string;
  region: string;
  priority: number;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}
export interface CredentialStore {
  resolve(providerId: string, environmentId: string): Promise<string>;
}
export interface ProviderRuntime {
  record: ProviderRecord;
  adapter: AIProviderAdapter;
  credential: string;
  health: ProviderHealthState;
}
export class ProviderRegistry {
  constructor(
    private readonly records: readonly ProviderRecord[],
    private readonly adapters: ReadonlyMap<string, AIProviderAdapter>,
    private readonly credentials: CredentialStore,
  ) {}
  listSafe() {
    return this.records.map(
      ({
        id,
        name,
        slug,
        status,
        adapterType,
        baseUrl,
        region,
        priority,
        enabled,
        createdAt,
        updatedAt,
      }) => ({
        id,
        name,
        slug,
        status,
        adapterType,
        baseUrl,
        region,
        priority,
        enabled,
        createdAt,
        updatedAt,
        credentialConfigured: true,
      }),
    );
  }
  async runtime(
    providerId: string,
    environmentId: string,
  ): Promise<ProviderRuntime> {
    const record = this.records.find((value) => value.id === providerId);
    const adapter = record && this.adapters.get(record.adapterType);
    if (
      !record ||
      !adapter ||
      !record.enabled ||
      ["disabled", "maintenance", "unavailable"].includes(record.status)
    )
      throw Object.assign(new Error("Provider unavailable"), {
        code: "provider_unavailable",
      });
    return {
      record,
      adapter,
      credential: await this.credentials.resolve(providerId, environmentId),
      health: record.status === "degraded" ? "degraded" : "healthy",
    };
  }
}
