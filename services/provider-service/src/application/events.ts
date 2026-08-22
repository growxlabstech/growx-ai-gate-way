import type {
  ProviderCredentialEntity,
  ProviderEntity,
} from "../domain/types.js";

export interface IProviderEvents {
  emitProviderCreated(
    provider: ProviderEntity,
    operatorId: string,
    requestId?: string,
  ): Promise<void>;
  emitProviderUpdated(
    provider: ProviderEntity,
    operatorId: string,
    requestId?: string,
  ): Promise<void>;
  emitProviderDisabled(
    providerId: string,
    operatorId: string,
    requestId?: string,
  ): Promise<void>;
  emitProviderEnabled(
    providerId: string,
    operatorId: string,
    requestId?: string,
  ): Promise<void>;

  emitCredentialCreated(
    credential: ProviderCredentialEntity,
    operatorId: string,
    requestId?: string,
  ): Promise<void>;
  emitCredentialRotated(
    credential: ProviderCredentialEntity,
    previousId: string,
    operatorId: string,
    requestId?: string,
  ): Promise<void>;
  emitCredentialDisabled(
    credentialId: string,
    operatorId: string,
    requestId?: string,
  ): Promise<void>;

  emitSecurityEvent(
    type: string,
    data: Record<string, unknown>,
    requestId?: string,
  ): Promise<void>;
}
