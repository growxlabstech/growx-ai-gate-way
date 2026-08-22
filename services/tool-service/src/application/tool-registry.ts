import { createPublicId } from "@growx/ids";
import { computeSha256 } from "@growx/tools";
import type { RegisteredTool, RegisteredToolVersion } from "@growx/contracts";
import type { ToolRegistryEntry } from "../domain/types.js";

export interface IToolRepository {
  findByKey(
    organizationId: string,
    key: string,
    workspaceId?: string,
  ): Promise<RegisteredTool | null>;
  findById(id: string): Promise<RegisteredTool | null>;
  listByOrganization(
    organizationId: string,
    status?: string,
  ): Promise<RegisteredTool[]>;
  create(tool: RegisteredTool): Promise<void>;
  update(id: string, updates: Partial<RegisteredTool>): Promise<void>;
  findVersion(
    toolId: string,
    version: number,
  ): Promise<RegisteredToolVersion | null>;
  findActiveVersion(toolId: string): Promise<RegisteredToolVersion | null>;
  createVersion(version: RegisteredToolVersion): Promise<void>;
  listVersions(toolId: string): Promise<RegisteredToolVersion[]>;
}

export class InMemoryToolRepository implements IToolRepository {
  private tools = new Map<string, RegisteredTool>();
  private versions = new Map<string, RegisteredToolVersion[]>();

  async findByKey(
    organizationId: string,
    key: string,
    workspaceId?: string,
  ): Promise<RegisteredTool | null> {
    for (const t of this.tools.values()) {
      if (t.organizationId === organizationId && t.key === key) {
        if (workspaceId && t.workspaceId && t.workspaceId !== workspaceId)
          continue;
        return t;
      }
    }
    return null;
  }

  async findById(id: string): Promise<RegisteredTool | null> {
    return this.tools.get(id) ?? null;
  }

  async listByOrganization(
    organizationId: string,
    status?: string,
  ): Promise<RegisteredTool[]> {
    return Array.from(this.tools.values()).filter(
      (t) =>
        t.organizationId === organizationId && (!status || t.status === status),
    );
  }

  async create(tool: RegisteredTool): Promise<void> {
    this.tools.set(tool.id, tool);
  }

  async update(id: string, updates: Partial<RegisteredTool>): Promise<void> {
    const existing = this.tools.get(id);
    if (existing) {
      this.tools.set(id, { ...existing, ...updates, updatedAt: new Date() });
    }
  }

  async findVersion(
    toolId: string,
    version: number,
  ): Promise<RegisteredToolVersion | null> {
    return (
      (this.versions.get(toolId) ?? []).find((v) => v.version === version) ??
      null
    );
  }

  async findActiveVersion(
    toolId: string,
  ): Promise<RegisteredToolVersion | null> {
    const tool = this.tools.get(toolId);
    if (!tool) return null;
    return (
      (this.versions.get(toolId) ?? []).find(
        (v) => v.version === tool.activeVersion,
      ) ?? null
    );
  }

  async createVersion(version: RegisteredToolVersion): Promise<void> {
    const existing = this.versions.get(version.toolId) ?? [];
    existing.push(version);
    this.versions.set(version.toolId, existing);
  }

  async listVersions(toolId: string): Promise<RegisteredToolVersion[]> {
    return this.versions.get(toolId) ?? [];
  }
}

export class ToolRegistryService {
  constructor(private readonly repository: IToolRepository) {}

  async createTool(params: {
    organizationId: string;
    workspaceId?: string;
    key: string;
    name: string;
    description?: string;
    executionMode?: "return_to_client" | "platform_managed";
    inputSchema: Record<string, unknown>;
    outputSchema?: Record<string, unknown>;
    createdBy: string;
  }): Promise<ToolRegistryEntry> {
    const existing = await this.repository.findByKey(
      params.organizationId,
      params.key,
      params.workspaceId,
    );
    if (existing) {
      throw new Error(
        `Tool with key '${params.key}' already exists in this scope`,
      );
    }

    const toolId = createPublicId("tool");
    const now = new Date();

    const tool: RegisteredTool = {
      id: toolId,
      organizationId: params.organizationId,
      workspaceId: params.workspaceId,
      key: params.key,
      name: params.name,
      description: params.description,
      inputSchema: params.inputSchema,
      outputSchema: params.outputSchema,
      executionMode: params.executionMode ?? "return_to_client",
      status: "active",
      visibility: "organization",
      activeVersion: 1,
      createdAt: now,
      updatedAt: now,
    };

    const contentHash = computeSha256(
      JSON.stringify({
        inputSchema: params.inputSchema,
        outputSchema: params.outputSchema,
        executionMode: tool.executionMode,
      }),
    );

    const version: RegisteredToolVersion = {
      id: createPublicId("toolv"),
      toolId,
      version: 1,
      description: params.description,
      inputSchema: params.inputSchema,
      outputSchema: params.outputSchema,
      executionMode: tool.executionMode,
      requiredCapabilities: [],
      contentHash,
      createdAt: now,
    };

    await this.repository.create(tool);
    await this.repository.createVersion(version);

    return { tool, activeVersion: version };
  }

  async getTool(id: string): Promise<ToolRegistryEntry | null> {
    const tool = await this.repository.findById(id);
    if (!tool) return null;
    const activeVersion = await this.repository.findActiveVersion(id);
    if (!activeVersion) return null;
    return { tool, activeVersion };
  }

  async listTools(
    organizationId: string,
    status?: string,
  ): Promise<RegisteredTool[]> {
    return this.repository.listByOrganization(organizationId, status);
  }

  async archiveTool(id: string): Promise<void> {
    const tool = await this.repository.findById(id);
    if (!tool) throw new Error(`Tool '${id}' not found`);
    await this.repository.update(id, { status: "archived" });
  }

  async createVersion(
    toolId: string,
    params: {
      inputSchema: Record<string, unknown>;
      outputSchema?: Record<string, unknown>;
      description?: string;
      createdBy: string;
    },
  ): Promise<RegisteredToolVersion> {
    const tool = await this.repository.findById(toolId);
    if (!tool) throw new Error(`Tool '${toolId}' not found`);

    const versions = await this.repository.listVersions(toolId);
    const nextVersion = versions.length + 1;

    const contentHash = computeSha256(
      JSON.stringify({
        inputSchema: params.inputSchema,
        outputSchema: params.outputSchema,
        executionMode: tool.executionMode,
      }),
    );

    const version: RegisteredToolVersion = {
      id: createPublicId("toolv"),
      toolId,
      version: nextVersion,
      description: params.description,
      inputSchema: params.inputSchema,
      outputSchema: params.outputSchema,
      executionMode: tool.executionMode,
      requiredCapabilities: [],
      contentHash,
      createdAt: new Date(),
    };

    await this.repository.createVersion(version);
    await this.repository.update(toolId, { activeVersion: nextVersion });

    return version;
  }
}
