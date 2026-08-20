import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryGovernanceRepository } from '../src/repository.js';
import { DataExportManager } from '../src/export-manager.js';
import type { DataResource, DataExportRequest } from '@growx/contracts';

describe('DataExportManager', () => {
  let repo: InMemoryGovernanceRepository;
  let exportManager: DataExportManager;

  beforeEach(() => {
    repo = new InMemoryGovernanceRepository();
    exportManager = new DataExportManager(repo);
  });

  it('generates customer data export with 7-day retention and short-lived URL', async () => {
    const res: DataResource = {
      id: 'dres_export_sample',
      organizationId: 'org_export_test',
      resourceType: 'prompt',
      resourceId: 'req_123',
      dataClass: 'CUSTOMER_CONTENT',
      dataCategory: 'prompt',
      region: 'GLOBAL',
      createdAt: new Date(),
    };
    await repo.registerResource(res);

    const exportReq: DataExportRequest = {
      id: 'exp_req_1',
      organizationId: 'org_export_test',
      requestedBy: 'usr_owner',
      status: 'requested',
      createdAt: new Date(),
    };
    await repo.createExportRequest(exportReq);

    const processed = await exportManager.processExport('exp_req_1');
    expect(processed.status).toBe('completed');
    expect(processed.outputFileId).toBeDefined();
    expect(processed.downloadUrl).toContain('exports.growx.internal');
    expect(processed.expiresAt?.getTime()).toBeGreaterThan(Date.now() + 6 * 86400 * 1000);
  });
});
