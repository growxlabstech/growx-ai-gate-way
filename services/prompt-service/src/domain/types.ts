import type {
  PromptDefinition,
  PromptVersion,
  PromptRelease,
  PromptReleaseHead,
  PromptReleaseEnvironment,
  PromptStatus,
  PromptVisibility,
} from "@growx/contracts";

export interface PromptListFilter {
  organizationId: string;
  workspaceId?: string | undefined;
  status?: PromptStatus | undefined;
  visibility?: PromptVisibility | undefined;
  search?: string | undefined;
}

export interface IPromptRepository {
  // Definitions
  createDefinition(definition: PromptDefinition): Promise<PromptDefinition>;
  getDefinitionById(id: string): Promise<PromptDefinition | null>;
  getDefinitionByKey(organizationId: string, key: string, workspaceId?: string | null | undefined): Promise<PromptDefinition | null>;
  updateDefinition(id: string, updates: Partial<PromptDefinition>): Promise<PromptDefinition>;
  listDefinitions(filter: PromptListFilter): Promise<PromptDefinition[]>;

  // Versions
  createVersion(version: PromptVersion): Promise<PromptVersion>;
  getVersionById(id: string): Promise<PromptVersion | null>;
  getVersionByNumber(promptId: string, versionNumber: number): Promise<PromptVersion | null>;
  listVersions(promptId: string): Promise<PromptVersion[]>;

  // Releases
  createRelease(release: PromptRelease): Promise<PromptRelease>;
  getReleaseById(id: string): Promise<PromptRelease | null>;
  listReleases(promptId: string, environment?: PromptReleaseEnvironment | undefined): Promise<PromptRelease[]>;

  // Release Heads (Active Releases)
  getReleaseHead(promptId: string, environment: PromptReleaseEnvironment): Promise<PromptReleaseHead | null>;
  setReleaseHead(head: PromptReleaseHead): Promise<PromptReleaseHead>;
}

export interface IPromptEvents {
  emitPromptEvent(action: string, payload: Record<string, unknown>, requestId?: string | undefined): Promise<void>;
  emitSecurityEvent(action: string, payload: Record<string, unknown>, requestId?: string | undefined): Promise<void>;
}
