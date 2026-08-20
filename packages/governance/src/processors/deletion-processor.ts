import type {
  DeletionProcessorType,
  DeletionTask,
  DeletionEvidence,
} from "@growx/contracts";
import { createPublicId } from "@growx/ids";

export interface GovernanceDeletionProcessor {
  readonly processorType: DeletionProcessorType;

  discover(options: {
    organizationId: string;
    workspaceId?: string;
    userId?: string;
    resourceType?: string;
    resourceId?: string;
  }): Promise<string[]>;

  delete(resourceId: string, context: { organizationId: string }): Promise<void>;

  verify(resourceId: string, context: { organizationId: string }): Promise<boolean>;
}

export class MockDomainDeletionProcessor implements GovernanceDeletionProcessor {
  private deletedItems = new Set<string>();

  constructor(public readonly processorType: DeletionProcessorType) {}

  public async discover(options: {
    organizationId: string;
    workspaceId?: string;
    userId?: string;
    resourceType?: string;
    resourceId?: string;
  }): Promise<string[]> {
    if (options.resourceId) return [options.resourceId];
    return [`${this.processorType}_sample_res_${options.organizationId}`];
  }

  public async delete(resourceId: string, _context: { organizationId: string }): Promise<void> {
    this.deletedItems.add(resourceId);
  }

  public async verify(resourceId: string, _context: { organizationId: string }): Promise<boolean> {
    return this.deletedItems.has(resourceId);
  }
}
