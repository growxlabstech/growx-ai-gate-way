import type {
  CanonicalCapability,
  ProviderCredentialStatus,
  ProviderStatus,
} from "@growx/contracts";

export interface ProviderEntity {
  id: string;
  code: string;
  displayName: string;
  adapterType: string;
  baseUrl: string;
  apiVersion?: string | null | undefined;
  region: string;
  priority: number;
  enabled: boolean;
  status: ProviderStatus;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProviderCredentialEntity {
  id: string;
  providerId: string;
  connectionId?: string | null | undefined;
  providerAccountId?: string | undefined;
  credentialType?: string | undefined;
  name: string;
  environment: string;
  encryptedPayload: string;
  encryptionKeyVersion: string;
  status: ProviderCredentialStatus;
  activeVersionId?: string | undefined;
  metadata: Record<string, unknown>;
  expiresAt?: Date | undefined;
  createdAt: Date;
  updatedAt: Date;
  rotatedAt?: Date | null | undefined;
  disabledAt?: Date | null | undefined;
}

export interface ResolvedExecutionRoute {
  providerId: string;
  providerModelId: string;
  region?: string | undefined;
  capabilities: CanonicalCapability[];
  credentialId?: string | undefined;
  contextWindow?: number | undefined;
  maxOutputTokens?: number | undefined;
}
