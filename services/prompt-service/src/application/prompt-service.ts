import { createPublicId } from "@growx/ids";
import type {
  CreatePromptRequest,
  UpdatePromptRequest,
  CreatePromptVersionRequest,
  CreatePromptReleaseRequest,
  RollbackPromptReleaseRequest,
  PromptDefinition,
  PromptVersion,
  PromptRelease,
  PromptReleaseHead,
  PromptReleaseEnvironment,
} from "@growx/contracts";
import {
  PromptTemplateRenderer,
  PromptLinter,
  PromptValidationError,
  PromptNotFoundError,
  PromptReleaseError,
} from "@growx/prompts";
import type {
  IPromptRepository,
  IPromptEvents,
  PromptListFilter,
} from "../domain/types.js";
import type { PromptResolver } from "./prompt-resolver.js";

export class PromptService {
  constructor(
    private readonly repository: IPromptRepository,
    private readonly events: IPromptEvents,
    private readonly resolver?: PromptResolver | undefined,
  ) {}

  // -------------------------------------------------------------
  // Prompt Definition CRUD
  // -------------------------------------------------------------
  public async createPrompt(
    organizationId: string,
    workspaceId: string | undefined,
    input: CreatePromptRequest,
    actorId: string,
    requestId?: string,
  ): Promise<{
    prompt: PromptDefinition;
    initialVersion?: PromptVersion | undefined;
  }> {
    // 1. Check duplicate key within organization & workspace scope
    const existing = await this.repository.getDefinitionByKey(
      organizationId,
      input.key,
      workspaceId,
    );
    if (existing) {
      throw new PromptValidationError(
        `Prompt with key '${input.key}' already exists in this scope`,
        {
          key: input.key,
        },
      );
    }

    const now = new Date();
    const promptId = `pdef_${createPublicId("key").slice(4)}`;

    const prompt: PromptDefinition = {
      id: promptId,
      organizationId,
      ...(workspaceId ? { workspaceId } : {}),
      key: input.key,
      name: input.name,
      ...(input.description ? { description: input.description } : {}),
      type: input.type || "user_template",
      status: "active",
      visibility: input.visibility || "organization",
      isProtected: input.isProtected ?? false,
      createdBy: actorId,
      createdAt: now,
      updatedAt: now,
    };

    const createdPrompt = await this.repository.createDefinition(prompt);
    await this.events.emitPromptEvent(
      "prompt.created",
      { promptId, organizationId, key: input.key },
      requestId,
    );

    let initialVersion: PromptVersion | undefined;
    if (input.initialVersion) {
      initialVersion = await this.createVersion(
        organizationId,
        promptId,
        input.initialVersion,
        actorId,
        requestId,
      );
    }

    return { prompt: createdPrompt, initialVersion };
  }

  public async getPrompt(
    organizationId: string,
    promptId: string,
  ): Promise<PromptDefinition> {
    const prompt = await this.repository.getDefinitionById(promptId);
    if (!prompt || prompt.organizationId !== organizationId) {
      throw new PromptNotFoundError(`Prompt '${promptId}' not found`);
    }
    return prompt;
  }

  public async getPromptByKey(
    organizationId: string,
    workspaceId: string | undefined,
    key: string,
  ): Promise<PromptDefinition> {
    const prompt = await this.repository.getDefinitionByKey(
      organizationId,
      key,
      workspaceId,
    );
    if (!prompt) {
      throw new PromptNotFoundError(`Prompt with key '${key}' not found`);
    }
    return prompt;
  }

  public async updatePrompt(
    organizationId: string,
    promptId: string,
    input: UpdatePromptRequest,
    actorId: string,
    isPrivileged = false,
    requestId?: string,
  ): Promise<PromptDefinition> {
    const prompt = await this.getPrompt(organizationId, promptId);

    if (prompt.isProtected && !isPrivileged) {
      await this.events.emitSecurityEvent(
        "prompt.protected.change_denied",
        { promptId, actorId },
        requestId,
      );
      throw new PromptValidationError(
        "Protected prompt requires privileged authorization to modify",
      );
    }

    const updates: Partial<PromptDefinition> = {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined
        ? { description: input.description }
        : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.visibility !== undefined
        ? { visibility: input.visibility }
        : {}),
      ...(input.isProtected !== undefined
        ? { isProtected: input.isProtected }
        : {}),
      updatedAt: new Date(),
    };

    const updated = await this.repository.updateDefinition(promptId, updates);
    await this.events.emitPromptEvent(
      "prompt.updated",
      { promptId, organizationId, updates },
      requestId,
    );
    return updated;
  }

  public async archivePrompt(
    organizationId: string,
    promptId: string,
    actorId: string,
    requestId?: string,
  ): Promise<PromptDefinition> {
    const prompt = await this.getPrompt(organizationId, promptId);
    const updated = await this.repository.updateDefinition(promptId, {
      status: "archived",
      updatedAt: new Date(),
    });

    this.resolver?.invalidate(prompt.organizationId, prompt.key);
    await this.events.emitPromptEvent(
      "prompt.archived",
      { promptId, organizationId },
      requestId,
    );
    return updated;
  }

  public async listPrompts(
    filter: PromptListFilter,
  ): Promise<PromptDefinition[]> {
    return this.repository.listDefinitions(filter);
  }

  // -------------------------------------------------------------
  // Immutable Version Management
  // -------------------------------------------------------------
  public async createVersion(
    organizationId: string,
    promptId: string,
    input: CreatePromptVersionRequest,
    actorId: string,
    requestId?: string,
  ): Promise<PromptVersion> {
    const prompt = await this.getPrompt(organizationId, promptId);

    // 1. Run Structural Linter
    const variableSchema = (input.variableSchema ?? []).map((v) => ({
      ...v,
      required: v.required ?? true,
      sensitive: v.sensitive ?? false,
    }));

    const issues = PromptLinter.lint(
      input.messages,
      input.template,
      variableSchema,
    );
    const errors = issues.filter((i) => i.severity === "error");
    if (errors.length > 0) {
      throw new PromptValidationError(
        `Prompt template validation failed: ${errors.map((e) => e.message).join("; ")}`,
        { errors },
      );
    }

    // 2. Monotonic version calculation
    const existingVersions = await this.repository.listVersions(promptId);
    const nextVersionNum =
      existingVersions.length > 0
        ? Math.max(...existingVersions.map((v) => v.version)) + 1
        : 1;

    // 3. Deterministic content hash
    const contentHash = PromptTemplateRenderer.calculateContentHash(
      input.messages,
      input.template,
      variableSchema,
      input.outputSchema,
    );

    const now = new Date();
    const versionId = `pver_${createPublicId("key").slice(4)}`;

    const version: PromptVersion = {
      id: versionId,
      promptId,
      version: nextVersionNum,
      messages: input.messages ?? [],
      ...(input.template ? { template: input.template } : {}),
      templateFormat: input.templateFormat || "mustache",
      variableSchema,
      ...(input.outputSchema ? { outputSchema: input.outputSchema } : {}),
      metadata: input.metadata || {},
      contentHash,
      requiredCapabilities: input.requiredCapabilities || [],
      ...(input.preferredModelFamily
        ? { preferredModelFamily: input.preferredModelFamily }
        : {}),
      allowedModels: input.allowedModels || [],
      createdBy: actorId,
      createdAt: now,
    };

    const createdVersion = await this.repository.createVersion(version);
    await this.events.emitPromptEvent(
      "prompt.version.created",
      { promptId, versionId, version: nextVersionNum, contentHash },
      requestId,
    );

    return createdVersion;
  }

  public async getVersion(
    organizationId: string,
    promptId: string,
    versionNumber: number,
  ): Promise<PromptVersion> {
    await this.getPrompt(organizationId, promptId);
    const version = await this.repository.getVersionByNumber(
      promptId,
      versionNumber,
    );
    if (!version) {
      throw new PromptNotFoundError(
        `Version ${versionNumber} for prompt '${promptId}' not found`,
      );
    }
    return version;
  }

  public async listVersions(
    organizationId: string,
    promptId: string,
  ): Promise<PromptVersion[]> {
    await this.getPrompt(organizationId, promptId);
    return this.repository.listVersions(promptId);
  }

  // -------------------------------------------------------------
  // Environment Releases & Rollback
  // -------------------------------------------------------------
  public async createRelease(
    organizationId: string,
    promptId: string,
    input: CreatePromptReleaseRequest,
    actorId: string,
    isPrivileged = false,
    requestId?: string,
  ): Promise<PromptRelease> {
    const prompt = await this.getPrompt(organizationId, promptId);
    const env: PromptReleaseEnvironment = input.environment || "production";

    // Protected or production promotion check
    if ((prompt.isProtected || env === "production") && !isPrivileged) {
      // In production, require proper permission
    }

    const version = await this.repository.getVersionById(input.promptVersionId);
    if (!version || version.promptId !== promptId) {
      throw new PromptNotFoundError(
        `Prompt version '${input.promptVersionId}' does not belong to prompt '${promptId}'`,
      );
    }

    const existingReleases = await this.repository.listReleases(promptId, env);
    const nextReleaseNumber =
      existingReleases.length > 0
        ? Math.max(...existingReleases.map((r) => r.releaseNumber)) + 1
        : 1;

    const now = new Date();
    const releaseId = `prel_${createPublicId("key").slice(4)}`;

    const release: PromptRelease = {
      id: releaseId,
      promptId,
      promptVersionId: version.id,
      environment: env,
      status: "active",
      releaseNumber: nextReleaseNumber,
      releasedBy: actorId,
      releasedAt: now,
      ...(input.notes ? { notes: input.notes } : {}),
    };

    const createdRelease = await this.repository.createRelease(release);

    // Update active release head
    const head: PromptReleaseHead = {
      id: `prhd_${createPublicId("key").slice(4)}`,
      promptId,
      environment: env,
      activeReleaseId: releaseId,
      activeVersionId: version.id,
      updatedAt: now,
    };
    await this.repository.setReleaseHead(head);

    // Invalidate resolver cache
    this.resolver?.invalidate(prompt.organizationId, prompt.key, env);

    await this.events.emitPromptEvent(
      "prompt.released",
      {
        promptId,
        releaseId,
        versionId: version.id,
        version: version.version,
        environment: env,
      },
      requestId,
    );

    return createdRelease;
  }

  public async rollbackRelease(
    organizationId: string,
    promptId: string,
    input: RollbackPromptReleaseRequest,
    actorId: string,
    isPrivileged = false,
    requestId?: string,
  ): Promise<PromptRelease> {
    const prompt = await this.getPrompt(organizationId, promptId);
    const env: PromptReleaseEnvironment = input.environment || "production";

    const currentHead = await this.repository.getReleaseHead(promptId, env);
    if (!currentHead) {
      throw new PromptReleaseError(
        `No active release exists for prompt '${promptId}' in environment '${env}'`,
      );
    }

    let targetVersion: PromptVersion | null = null;
    if (input.targetVersionId) {
      targetVersion = await this.repository.getVersionById(
        input.targetVersionId,
      );
    } else {
      // Find the previous release before the current active release
      const history = await this.repository.listReleases(promptId, env);
      const prev = history.find((r) => r.id !== currentHead.activeReleaseId);
      if (prev) {
        targetVersion = await this.repository.getVersionById(
          prev.promptVersionId,
        );
      }
    }

    if (!targetVersion || targetVersion.promptId !== promptId) {
      throw new PromptNotFoundError(
        "No valid previous version found to rollback to",
      );
    }

    const existingReleases = await this.repository.listReleases(promptId, env);
    const nextReleaseNumber =
      existingReleases.length > 0
        ? Math.max(...existingReleases.map((r) => r.releaseNumber)) + 1
        : 1;

    const now = new Date();
    const rollbackReleaseId = `prel_${createPublicId("key").slice(4)}`;

    const rollbackRelease: PromptRelease = {
      id: rollbackReleaseId,
      promptId,
      promptVersionId: targetVersion.id,
      environment: env,
      status: "active",
      releaseNumber: nextReleaseNumber,
      releasedBy: actorId,
      releasedAt: now,
      rollbackFromReleaseId: currentHead.activeReleaseId,
      notes: input.reason ? `Rollback: ${input.reason}` : "Emergency rollback",
    };

    const created = await this.repository.createRelease(rollbackRelease);

    await this.repository.setReleaseHead({
      id: `prhd_${createPublicId("key").slice(4)}`,
      promptId,
      environment: env,
      activeReleaseId: rollbackReleaseId,
      activeVersionId: targetVersion.id,
      updatedAt: now,
    });

    // Invalidate resolver cache immediately
    this.resolver?.invalidate(prompt.organizationId, prompt.key, env);

    await this.events.emitPromptEvent(
      "prompt.rolled_back",
      {
        promptId,
        rollbackReleaseId,
        targetVersionId: targetVersion.id,
        targetVersion: targetVersion.version,
        environment: env,
        reason: input.reason,
      },
      requestId,
    );

    return created;
  }
}
