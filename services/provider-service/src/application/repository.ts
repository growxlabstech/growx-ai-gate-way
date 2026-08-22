import type {
  ProviderStatus,
  ProviderAccount,
  ProviderCredential,
  ProviderCredentialVersion,
  ProviderCredentialPool,
  ProviderCredentialPoolMember,
  ProviderAccountCapability,
  ProviderAccountLimit,
} from "@growx/contracts";
import type {
  ProviderCredentialEntity,
  ProviderEntity,
} from "../domain/types.js";

export interface ProviderListFilter {
  status?: ProviderStatus[] | undefined;
  enabled?: boolean | undefined;
}

export interface IProviderRepository {
  // Provider operations
  createProvider(provider: ProviderEntity): Promise<ProviderEntity>;
  getProviderById(id: string): Promise<ProviderEntity | null>;
  getProviderByCode(code: string): Promise<ProviderEntity | null>;
  updateProvider(
    id: string,
    updates: Partial<ProviderEntity>,
  ): Promise<ProviderEntity>;
  listProviders(filter?: ProviderListFilter): Promise<ProviderEntity[]>;

  // Credential operations (Phase 5 compatibility)
  createCredential(
    credential: ProviderCredentialEntity,
  ): Promise<ProviderCredentialEntity>;
  getCredentialById(id: string): Promise<ProviderCredentialEntity | null>;
  getEffectiveCredential(
    providerId: string,
    environment?: string,
    credentialId?: string,
  ): Promise<ProviderCredentialEntity | null>;
  listCredentialsByProviderId(
    providerId: string,
  ): Promise<ProviderCredentialEntity[]>;
  updateCredential(
    id: string,
    updates: Partial<ProviderCredentialEntity>,
  ): Promise<ProviderCredentialEntity>;

  // Phase 28: Provider Account operations
  createAccount(account: ProviderAccount): Promise<ProviderAccount>;
  getAccountById(id: string): Promise<ProviderAccount | null>;
  updateAccount(
    id: string,
    updates: Partial<ProviderAccount>,
  ): Promise<ProviderAccount>;
  listAccountsByProviderId(providerId: string): Promise<ProviderAccount[]>;

  // Phase 28: Provider Credential V2 & Version operations
  createCredentialV2(
    credential: ProviderCredential,
  ): Promise<ProviderCredential>;
  createCredentialVersion(
    version: ProviderCredentialVersion,
  ): Promise<ProviderCredentialVersion>;
  getCredentialVersionById(
    id: string,
  ): Promise<ProviderCredentialVersion | null>;
  getActiveCredentialVersion(
    credentialId: string,
  ): Promise<ProviderCredentialVersion | null>;
  updateCredentialVersion(
    id: string,
    updates: Partial<ProviderCredentialVersion>,
  ): Promise<ProviderCredentialVersion>;
  listCredentialVersions(
    credentialId: string,
  ): Promise<ProviderCredentialVersion[]>;
  listAllCredentialVersions?(): Promise<ProviderCredentialVersion[]>;
  listExpiringCredentials(thresholdDate: Date): Promise<ProviderCredential[]>;

  // Phase 28: Pool operations
  createPool(pool: ProviderCredentialPool): Promise<ProviderCredentialPool>;
  getPoolById(id: string): Promise<ProviderCredentialPool | null>;
  listPools(providerId?: string): Promise<ProviderCredentialPool[]>;
  addPoolMember(
    member: ProviderCredentialPoolMember,
  ): Promise<ProviderCredentialPoolMember>;
  removePoolMember(memberId: string): Promise<void>;
  listPoolMembers(poolId: string): Promise<ProviderCredentialPoolMember[]>;

  // Phase 28: Account Capability & Limits
  setAccountCapability(
    capability: ProviderAccountCapability,
  ): Promise<ProviderAccountCapability>;
  listAccountCapabilities(
    accountId: string,
  ): Promise<ProviderAccountCapability[]>;
  setAccountLimit(limit: ProviderAccountLimit): Promise<ProviderAccountLimit>;
  listAccountLimits(accountId: string): Promise<ProviderAccountLimit[]>;
}
