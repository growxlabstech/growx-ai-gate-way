import type { SecretProvider } from "./secret-provider.js";
import type { IProviderRepository } from "../application/repository.js";

export interface ReconciliationReport {
  scannedCount: number;
  healthyCount: number;
  missingVaultSecrets: Array<{ versionId: string; secretReference: string }>;
  orphanSecrets: string[];
  reconciledAt: Date;
}

export class SecretReconciliationWorker {
  constructor(
    private readonly repository: IProviderRepository,
    private readonly secretProvider: SecretProvider,
  ) {}

  public async reconcile(): Promise<ReconciliationReport> {
    const missingVaultSecrets: Array<{
      versionId: string;
      secretReference: string;
    }> = [];
    const versions =
      (await this.repository.listAllCredentialVersions?.()) || [];

    let scannedCount = 0;
    let healthyCount = 0;

    for (const ver of versions) {
      scannedCount++;
      const secret = await this.secretProvider.getSecret(ver.secretReference);
      if (!secret) {
        missingVaultSecrets.push({
          versionId: ver.id,
          secretReference: ver.secretReference,
        });
      } else {
        healthyCount++;
      }
    }

    return {
      scannedCount,
      healthyCount,
      missingVaultSecrets,
      orphanSecrets: [], // In-memory/envelope vaults do not blindly list foreign keys
      reconciledAt: new Date(),
    };
  }
}
