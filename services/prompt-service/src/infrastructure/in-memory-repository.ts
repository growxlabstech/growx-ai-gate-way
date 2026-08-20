import type {
  PromptDefinition,
  PromptVersion,
  PromptRelease,
  PromptReleaseHead,
  PromptReleaseEnvironment,
} from "@growx/contracts";
import type { IPromptRepository, PromptListFilter } from "../domain/types.js";

export class InMemoryPromptRepository implements IPromptRepository {
  private readonly definitions = new Map<string, PromptDefinition>();
  private readonly versions = new Map<string, PromptVersion>();
  private readonly releases = new Map<string, PromptRelease>();
  private readonly releaseHeads = new Map<string, PromptReleaseHead>();

  async createDefinition(definition: PromptDefinition): Promise<PromptDefinition> {
    this.definitions.set(definition.id, { ...definition });
    return { ...definition };
  }

  async getDefinitionById(id: string): Promise<PromptDefinition | null> {
    const d = this.definitions.get(id);
    return d ? { ...d } : null;
  }

  async getDefinitionByKey(
    organizationId: string,
    key: string,
    workspaceId?: string | null | undefined
  ): Promise<PromptDefinition | null> {
    let orgWidePrompt: PromptDefinition | null = null;
    for (const d of this.definitions.values()) {
      if (d.organizationId === organizationId && d.key === key) {
        if (workspaceId && d.workspaceId === workspaceId) {
          return { ...d };
        }
        if (!d.workspaceId) {
          orgWidePrompt = { ...d };
        }
      }
    }
    return orgWidePrompt;
  }

  async updateDefinition(id: string, updates: Partial<PromptDefinition>): Promise<PromptDefinition> {
    const curr = this.definitions.get(id);
    if (!curr) throw new Error(`Prompt ${id} not found`);
    const updated = { ...curr, ...updates, updatedAt: new Date() };
    this.definitions.set(id, updated);
    return { ...updated };
  }

  async listDefinitions(filter: PromptListFilter): Promise<PromptDefinition[]> {
    let list = Array.from(this.definitions.values()).filter(d => d.organizationId === filter.organizationId);
    if (filter.workspaceId) {
      list = list.filter(d => !d.workspaceId || d.workspaceId === filter.workspaceId);
    }
    if (filter.status) {
      list = list.filter(d => d.status === filter.status);
    }
    if (filter.visibility) {
      list = list.filter(d => d.visibility === filter.visibility);
    }
    if (filter.search) {
      const q = filter.search.toLowerCase();
      list = list.filter(d => d.key.toLowerCase().includes(q) || d.name.toLowerCase().includes(q));
    }
    return list.map(d => ({ ...d }));
  }

  async createVersion(version: PromptVersion): Promise<PromptVersion> {
    this.versions.set(version.id, { ...version });
    return { ...version };
  }

  async getVersionById(id: string): Promise<PromptVersion | null> {
    const v = this.versions.get(id);
    return v ? { ...v } : null;
  }

  async getVersionByNumber(promptId: string, versionNumber: number): Promise<PromptVersion | null> {
    for (const v of this.versions.values()) {
      if (v.promptId === promptId && v.version === versionNumber) {
        return { ...v };
      }
    }
    return null;
  }

  async listVersions(promptId: string): Promise<PromptVersion[]> {
    return Array.from(this.versions.values())
      .filter(v => v.promptId === promptId)
      .sort((a, b) => b.version - a.version)
      .map(v => ({ ...v }));
  }

  async createRelease(release: PromptRelease): Promise<PromptRelease> {
    this.releases.set(release.id, { ...release });
    return { ...release };
  }

  async getReleaseById(id: string): Promise<PromptRelease | null> {
    const r = this.releases.get(id);
    return r ? { ...r } : null;
  }

  async listReleases(promptId: string, environment?: PromptReleaseEnvironment): Promise<PromptRelease[]> {
    let list = Array.from(this.releases.values()).filter(r => r.promptId === promptId);
    if (environment) {
      list = list.filter(r => r.environment === environment);
    }
    return list.sort((a, b) => b.releaseNumber - a.releaseNumber).map(r => ({ ...r }));
  }

  async getReleaseHead(promptId: string, environment: PromptReleaseEnvironment): Promise<PromptReleaseHead | null> {
    const key = `${promptId}:${environment}`;
    const h = this.releaseHeads.get(key);
    return h ? { ...h } : null;
  }

  async setReleaseHead(head: PromptReleaseHead): Promise<PromptReleaseHead> {
    const key = `${head.promptId}:${head.environment}`;
    this.releaseHeads.set(key, { ...head });
    return { ...head };
  }
}
