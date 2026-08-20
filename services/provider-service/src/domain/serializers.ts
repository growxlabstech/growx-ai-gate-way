import type {
  ProviderCredentialMetadata,
  ProviderRecord,
} from "@growx/contracts";
import type {
  ProviderCredentialEntity,
  ProviderEntity,
} from "./types.js";

export function toProviderRecord(entity: ProviderEntity): ProviderRecord {
  return {
    id: entity.id,
    code: entity.code,
    displayName: entity.displayName,
    adapterType: entity.adapterType,
    baseUrl: entity.baseUrl,
    apiVersion: entity.apiVersion ?? null,
    region: entity.region,
    priority: entity.priority,
    enabled: entity.enabled,
    status: entity.status,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
    metadata: entity.metadata,
  };
}

export function toCredentialMetadata(
  entity: ProviderCredentialEntity
): ProviderCredentialMetadata {
  return {
    id: entity.id,
    providerId: entity.providerId,
    name: entity.name,
    environment: entity.environment,
    encryptionKeyVersion: entity.encryptionKeyVersion,
    status: entity.status,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
    rotatedAt: entity.rotatedAt ?? null,
    disabledAt: entity.disabledAt ?? null,
    metadata: entity.metadata,
  };
}
