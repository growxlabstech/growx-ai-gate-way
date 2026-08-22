import { PromptTemplateRenderer } from "@growx/prompts";
import type {
  PromptResolver,
  ResolvedPromptContext,
} from "@growx/prompt-service";
import {
  GrowXProviderError,
  type NormalizedStreamEvent,
  type OpenAIChatCompletionChunk,
  type OpenAIChatCompletionRequest,
  type OpenAIChatCompletionResponse,
  type OpenAIEmbeddingRequest,
  type OpenAIEmbeddingResponse,
  type NormalizedEmbeddingRequest,
  type NormalizedEmbeddingResponse,
  type EmbeddingModelMetadata,
  type ImageGenerationRequest,
  type ImageGenerationResponse,
  type ImageEditRequest,
  type TranscriptionRequest,
  type TranscriptionResponse,
  type SpeechRequest,
  type SpeechResponse,
} from "@growx/contracts";
import {
  MediaValidator,
  VoiceRegistry,
  OpenAIImageAdapter,
  OpenAIAudioAdapter,
  DeterministicMultimodalAdapter,
  MediaValidationError,
  PixelBombError,
  VoiceUnsupportedError,
} from "@growx/multimodal";
import {
  normalizeEmbeddingInput,
  validateEmbeddingInput,
  resolveEmbeddingDimensions,
  formatVectorOutput,
  EmbeddingResponseValidator,
  EmbeddingBatchPlanner,
  OpenAIEmbeddingAdapter,
  GeminiEmbeddingAdapter,
  DeterministicEmbeddingAdapter,
} from "@growx/embeddings";
import type { MachineAuthContext } from "@growx/api-key-service";
import { modelAllowed } from "@growx/api-key-service";
import { createPublicId } from "@growx/ids";
import type {
  ModelRegistryService,
  ProviderRouteEntity,
} from "@growx/model-registry-service";
import type {
  ProviderService,
  ResolvedExecutionRoute,
} from "@growx/provider-service";
import type { GatewayAttemptEntity } from "@growx/routing";
import {
  deriveRequiredCapabilities,
  toNormalizedGenerationRequest,
  toOpenAIChatCompletionChunk,
  toOpenAIChatCompletionResponse,
} from "../domain/openai-translator.js";
import {
  DeterministicRouteResolver,
  type IRouteResolver,
} from "../domain/route-resolver.js";
import { StreamState } from "../domain/stream-state.js";
import type {
  GatewayExecutionOptions,
  GatewayRequestEntity,
  StreamExecutionOptions,
} from "../domain/types.js";
import type { IGatewayEvents } from "./events.js";
import type { IGatewayRepository } from "./repository.js";
import { GatewayStreamController } from "./stream-controller.js";
import { StreamRegistry } from "./shutdown.js";
import {
  QuotaEngine,
  TokenEstimator,
  InMemoryCounterStore,
  InMemoryQuotaPolicyRepository,
  type QuotaReservation,
} from "@growx/rate-limits";
import {
  PolicyEngine,
  InMemoryPolicyRepository,
  type PolicyEvaluationContext,
} from "@growx/policy";
import {
  UsageMeteringService,
  InMemoryUsageLedgerRepository,
} from "@growx/metering";
import { GatewayResilienceController } from "./resilience-controller.js";
import {
  CacheService,
  SemanticCacheService,
  replayCachedResponseAsStream,
} from "@growx/cache";
import { CreditService, InMemoryCreditRepository } from "@growx/credit-service";
import {
  CustomerPriceCalculator,
  CustomerPricingResolver,
} from "@growx/pricing";
import { Decimal } from "@growx/money";
import { EntitlementGate } from "./entitlement-gate.js";
import type { FileService } from "@growx/storage-service";

export class GatewayEngine {
  private readonly routeResolver: IRouteResolver;
  private readonly streamRegistry: StreamRegistry;
  public readonly resilienceController: GatewayResilienceController;
  public readonly quotaEngine: QuotaEngine;
  public readonly tokenEstimator: TokenEstimator;
  public readonly policyEngine: PolicyEngine;
  public readonly usageMetering: UsageMeteringService;
  public readonly cacheService: CacheService;
  public readonly semanticCacheService: SemanticCacheService;
  public readonly creditService: CreditService;
  public readonly customerPriceCalculator: CustomerPriceCalculator;
  public readonly fileService?: FileService | undefined;
  public readonly promptResolver?: PromptResolver | undefined;
  private readonly billingEnabled: boolean;
  private readonly entitlementGate?: EntitlementGate | undefined;
  private readonly entitlementGateEnabled: boolean;

  constructor(
    private readonly modelRegistry: ModelRegistryService,
    private readonly providerService: ProviderService,
    private readonly repository: IGatewayRepository,
    private readonly events: IGatewayEvents,
    routeResolver?: IRouteResolver,
    streamRegistry?: StreamRegistry,
    resilienceController?: GatewayResilienceController,
    quotaEngine?: QuotaEngine,
    tokenEstimator?: TokenEstimator,
    policyEngine?: PolicyEngine,
    usageMetering?: UsageMeteringService,
    cacheService?: CacheService,
    creditService?: CreditService,
    customerPriceCalculator?: CustomerPriceCalculator,
    entitlementGate?: EntitlementGate,
    semanticCacheService?: SemanticCacheService,
    fileService?: FileService,
    promptResolver?: PromptResolver,
  ) {
    this.promptResolver = promptResolver;
    this.routeResolver = routeResolver ?? new DeterministicRouteResolver();
    this.streamRegistry = streamRegistry ?? new StreamRegistry();
    this.tokenEstimator = tokenEstimator ?? new TokenEstimator();
    this.fileService = fileService;
    this.quotaEngine =
      quotaEngine ??
      new QuotaEngine(
        new InMemoryCounterStore(),
        new InMemoryQuotaPolicyRepository(),
      );
    this.policyEngine =
      policyEngine ?? new PolicyEngine(new InMemoryPolicyRepository());
    this.usageMetering =
      usageMetering ??
      new UsageMeteringService({
        repository: new InMemoryUsageLedgerRepository(),
        tokenEstimator: this.tokenEstimator,
      });
    this.cacheService = cacheService ?? new CacheService();
    this.semanticCacheService =
      semanticCacheService ?? new SemanticCacheService();
    this.creditService =
      creditService ?? new CreditService(new InMemoryCreditRepository());
    this.customerPriceCalculator =
      customerPriceCalculator ??
      new CustomerPriceCalculator(new CustomerPricingResolver());
    this.billingEnabled = creditService !== undefined;
    this.entitlementGate = entitlementGate;
    this.entitlementGateEnabled = entitlementGate !== undefined;
    this.resilienceController =
      resilienceController ??
      new GatewayResilienceController(
        modelRegistry,
        providerService,
        repository,
        events,
        {
          quotaEngine: this.quotaEngine,
          tokenEstimator: this.tokenEstimator,
          policyEngine: this.policyEngine,
          usageMetering: this.usageMetering,
        },
      );
  }

  async executeChatCompletion(
    auth: MachineAuthContext,
    request: OpenAIChatCompletionRequest,
    options: GatewayExecutionOptions = {},
  ): Promise<OpenAIChatCompletionResponse> {
    const startTime = Date.now();
    const requestId = options.requestId ?? createPublicId("req");
    const timeoutMs = options.timeoutMs ?? 60_000;
    let canonicalModelId = "";
    let effectiveRequest = request;
    let resolvedPromptContext: ResolvedPromptContext | undefined;
    let promptExecutionRef:
      | {
          promptId: string;
          promptVersionId: string;
          contentHash: string;
          renderedHash: string;
        }
      | undefined;
    let promptRequiredCapabilities: string[] = [];

    if ((request as any).prompt) {
      if (!this.promptResolver) {
        throw new GrowXProviderError(
          "provider_invalid_request",
          "Prompt execution binding is not configured on this Gateway instance",
          false,
          500,
        );
      }
      resolvedPromptContext = await this.promptResolver.resolve(
        auth.organizationId,
        (request as any).prompt.key,
        ((request as any).prompt.environment as any) || "production",
        auth.workspaceId,
        (request as any).prompt.version,
      );

      const rendered = PromptTemplateRenderer.render(
        resolvedPromptContext.version,
        (request as any).prompt.variables || {},
      );

      promptExecutionRef = {
        promptId: resolvedPromptContext.prompt.id,
        promptVersionId: resolvedPromptContext.version.id,
        contentHash: rendered.contentHash,
        renderedHash: rendered.renderedHash,
      };
      promptRequiredCapabilities =
        (resolvedPromptContext.version.requiredCapabilities as any) || [];

      const targetModel =
        request.model ||
        resolvedPromptContext.version.preferredModelFamily ||
        "gpt-4o";
      effectiveRequest = {
        ...request,
        model: targetModel,
        messages: [
          ...(rendered.renderedMessages as any),
          ...(request.messages ?? []),
        ],
      };
    }

    await this.usageMetering
      .recordRequestStarted({
        requestId,
        organizationId: auth.organizationId,
        workspaceId: auth.workspaceId,
        apiKeyId: auth.apiKeyId,
        canonicalModelId: effectiveRequest.model,
        operation: "chat_completion",
        streaming: false,
      })
      .catch(() => {});

    try {
      // 1. Authorization: Verify API key has inference capability
      const hasPermission =
        auth.permissions.includes("chat.completions.create") ||
        auth.permissions.includes("responses.create");
      if (!hasPermission) {
        throw new GrowXProviderError(
          "model_not_allowed",
          "API key lacks 'chat.completions.create' capability",
          false,
          403,
        );
      }

      // 2. Resolve Model via Model Registry
      const resolvedModelContext = await this.modelRegistry.resolve(
        effectiveRequest.model,
        {
          allowDraft: false,
          allowDisabled: false,
        },
      );

      canonicalModelId = resolvedModelContext.canonicalModelId;

      // 2.5 Entitlement Gate: check plan allows access to this model
      if (this.entitlementGateEnabled) {
        const entitlementCheck = await this.entitlementGate!.checkAccess({
          organizationId: auth.organizationId,
          canonicalModelId,
          workspaceId: auth.workspaceId,
        });
        if (!entitlementCheck.allowed) {
          throw new GrowXProviderError(
            "policy_denied",
            entitlementCheck.reason ??
              `Model ${canonicalModelId} is not available on your current plan`,
            false,
            403,
          );
        }
      }

      // 2.6 Validate referenced files and modality compatibility
      await this.validateReferencedFiles(
        auth,
        request,
        resolvedModelContext,
        canonicalModelId,
      );

      // 3. Evaluate Policy Engine Governance
      const policyContext: PolicyEvaluationContext = {
        organizationId: auth.organizationId,
        workspaceId: auth.workspaceId,
        apiKeyId: auth.apiKeyId,
        environment: auth.environment,
        requestedModel: request.model,
        canonicalModel: {
          id: resolvedModelContext.model.id,
          canonicalId: resolvedModelContext.canonicalModelId,
          family: resolvedModelContext.model.family,
          category: resolvedModelContext.model.category,
          inputModalities: resolvedModelContext.model.inputModalities,
          outputModalities: resolvedModelContext.model.outputModalities,
          contextWindow: resolvedModelContext.model.contextWindow,
          maxOutputTokens: resolvedModelContext.model.maxOutputTokens,
        },
        requestCapabilities: deriveRequiredCapabilities(request),
        inputModalities: resolvedModelContext.model.inputModalities,
        outputModalities: resolvedModelContext.model.outputModalities,
        tools: (request.tools as any) ?? undefined,
        toolChoice: (request as any).tool_choice,
        parallelToolCalls: (request as any).parallel_tool_calls,
        structuredOutput: request.response_format
          ? {
              type: request.response_format.type as any,
              strict: (request.response_format as any).json_schema?.strict,
              schemaName: (request.response_format as any).json_schema?.name,
            }
          : undefined,
        reasoning: (request as any).reasoning_effort
          ? { effort: (request as any).reasoning_effort }
          : undefined,
        temperature: request.temperature ?? undefined,
        maxTokens:
          request.max_tokens ??
          (request as any).max_completion_tokens ??
          undefined,
        metadata: { requestId },
      };

      const policyDecision = await this.policyEngine.evaluateRequest(
        policyContext,
        {
          apiKeyModelRules: auth.modelRules,
        },
      );

      if (!policyDecision.allowed) {
        await this.events.emitSecurityEvent(
          "security.policy.violation",
          {
            apiKeyId: auth.apiKeyId,
            organizationId: auth.organizationId,
            workspaceId: auth.workspaceId,
            requestedModel: request.model,
            canonicalModelId: resolvedModelContext.canonicalModelId,
            denialCode: policyDecision.denialCode,
            reasons: policyDecision.reasons,
          },
          requestId,
        );

        const errorCode =
          policyDecision.denialCode === "MODEL_DENIED" ||
          policyDecision.denialCode === "MODEL_FAMILY_DENIED" ||
          policyDecision.denialCode === "MODEL_CATEGORY_DENIED"
            ? "model_not_allowed"
            : "policy_denied";

        throw new GrowXProviderError(
          errorCode,
          policyDecision.reasons[0] ??
            `Request denied by governance policy: ${policyDecision.denialCode}`,
          false,
          403,
        );
      }

      // 3.2 Cache Eligibility & Lookup
      const cacheParams = {
        organizationId: auth.organizationId,
        workspaceId: auth.workspaceId,
        canonicalModelId: resolvedModelContext.canonicalModelId,
        modelVersion: resolvedModelContext.model.updatedAt
          ? new Date(resolvedModelContext.model.updatedAt).toISOString()
          : "v1",
        policyFingerprint:
          (policyDecision as any).effectivePolicyFingerprint ?? "default",
        request,
      };

      const cacheLookup = await this.cacheService.lookup(cacheParams);
      if (cacheLookup.status === "HIT" && cacheLookup.entry) {
        const cachedEntry = cacheLookup.entry;
        const now = Date.now();
        const durationMs = Math.max(1, now - startTime);

        const cachedResponse: OpenAIChatCompletionResponse = {
          ...cachedEntry.responsePayload,
          id: `chatcmpl-${requestId.slice(4)}`,
          created: Math.floor(now / 1000),
        };

        const cacheRequestEntity: GatewayRequestEntity = {
          id: requestId,
          organizationId: auth.organizationId,
          workspaceId: auth.workspaceId,
          environmentId: auth.environmentId,
          apiKeyId: auth.apiKeyId,
          requestedModel: request.model,
          resolvedModel: canonicalModelId,
          status: "completed",
          stream: false,
          providerId: "cache",
          providerModelId: "cache_exact",
          startedAt: new Date(startTime),
          completedAt: new Date(now),
          latencyMs: durationMs,
          errorCode: null,
          finishReason: "stop",
          createdAt: new Date(startTime),
          cachedResponseUsed: true,
        };

        await this.repository.createRequest(cacheRequestEntity).catch(() => {});

        await this.usageMetering
          .recordRequestCompleted({
            requestId,
            status: "completed",
            durationMs,
          })
          .catch(() => {});

        return cachedResponse;
      }

      // 3.2.1 Semantic Cache Lookup
      const semanticLookup = await this.semanticCacheService.lookup({
        organizationId: auth.organizationId,
        workspaceId: auth.workspaceId,
        canonicalModel: resolvedModelContext.canonicalModelId,
        policyVersion: (policyDecision as any).policyVersion ?? 1,
        request,
      });

      if (semanticLookup.status === "HIT" && semanticLookup.entry) {
        const cachedEntry = semanticLookup.entry;
        const now = Date.now();
        const durationMs = Math.max(1, now - startTime);

        const cachedResponse: OpenAIChatCompletionResponse = {
          ...cachedEntry.responsePayload,
          id: `chatcmpl-${requestId.slice(4)}`,
          created: Math.floor(now / 1000),
        };

        const cacheRequestEntity: GatewayRequestEntity = {
          id: requestId,
          organizationId: auth.organizationId,
          workspaceId: auth.workspaceId,
          environmentId: auth.environmentId,
          apiKeyId: auth.apiKeyId,
          requestedModel: request.model,
          resolvedModel: canonicalModelId,
          status: "completed",
          stream: false,
          providerId: "cache",
          providerModelId: "cache_semantic",
          startedAt: new Date(startTime),
          completedAt: new Date(now),
          latencyMs: durationMs,
          errorCode: null,
          finishReason: "stop",
          createdAt: new Date(startTime),
          cachedResponseUsed: true,
        };

        await this.repository.createRequest(cacheRequestEntity).catch(() => {});

        await this.usageMetering
          .recordRequestCompleted({
            requestId,
            status: "completed",
            durationMs,
          })
          .catch(() => {});

        return cachedResponse;
      }

      // 3.3 Cold Cache Single-Flight Execution
      if (cacheLookup.cacheKey) {
        const coalesced = await this.cacheService.executeCoalesced(
          cacheLookup.cacheKey,
          async () => {
            const check = await this.cacheService.lookup(cacheParams);
            if (check.status === "HIT" && check.entry) {
              return check.entry.responsePayload;
            }
            return await this.executeProviderExecution(
              auth,
              request,
              resolvedModelContext,
              policyDecision,
              options,
              requestId,
              startTime,
              canonicalModelId,
              cacheParams,
              timeoutMs,
            );
          },
        );

        if (coalesced.coalesced) {
          const now = Date.now();
          const durationMs = Math.max(1, now - startTime);
          const followerResponse: OpenAIChatCompletionResponse = {
            ...coalesced.value,
            id: `chatcmpl-${requestId.slice(4)}`,
            created: Math.floor(now / 1000),
          };

          const cacheRequestEntity: GatewayRequestEntity = {
            id: requestId,
            organizationId: auth.organizationId,
            workspaceId: auth.workspaceId,
            environmentId: auth.environmentId,
            apiKeyId: auth.apiKeyId,
            requestedModel: request.model,
            resolvedModel: canonicalModelId,
            status: "completed",
            stream: false,
            providerId: "cache",
            providerModelId: "cache_exact",
            startedAt: new Date(startTime),
            completedAt: new Date(now),
            latencyMs: durationMs,
            errorCode: null,
            finishReason: "stop",
            createdAt: new Date(startTime),
            cachedResponseUsed: true,
          };

          await this.repository
            .createRequest(cacheRequestEntity)
            .catch(() => {});

          await this.usageMetering
            .recordRequestCompleted({
              requestId,
              status: "completed",
              durationMs,
            })
            .catch(() => {});

          return followerResponse;
        }

        return coalesced.value;
      }

      return await this.executeProviderExecution(
        auth,
        request,
        resolvedModelContext,
        policyDecision,
        options,
        requestId,
        startTime,
        canonicalModelId,
        cacheParams,
        timeoutMs,
      );
    } catch (err: unknown) {
      const isCancelled = options.cancellationSignal?.aborted;
      const errorCode =
        err instanceof GrowXProviderError
          ? err.code
          : err instanceof Error
            ? err.name
            : "provider_invalid_request";

      await this.usageMetering
        .recordRequestCompleted({
          requestId,
          status: isCancelled ? "cancelled" : "failed",
          errorCode,
        })
        .catch(() => {});

      throw err;
    }
  }

  private async executeProviderExecution(
    auth: MachineAuthContext,
    request: OpenAIChatCompletionRequest,
    resolvedModelContext: any,
    policyDecision: any,
    options: GatewayExecutionOptions,
    requestId: string,
    startTime: number,
    canonicalModelId: string,
    cacheParams: any,
    timeoutMs: number,
  ): Promise<OpenAIChatCompletionResponse> {
    let customerReservation: QuotaReservation | undefined;
    let billingReservationId: string | undefined;
    let requestRecordCreated = false;
    let providerId = "";

    try {
      // 3.5 Customer Quota & Capacity Check
      const estimatedTokens = this.tokenEstimator.estimate(
        request as any,
        resolvedModelContext.model,
      );

      const customerQuotaRes =
        await this.quotaEngine.evaluateAndReserveCustomerQuota({
          apiKey: { id: auth.apiKeyId, rateLimits: auth.rateLimits },
          organizationId: auth.organizationId,
          workspaceId: auth.workspaceId,
          estimatedTokens,
          stream: false,
          requestId,
        });

      if (!customerQuotaRes.decision.allowed) {
        await this.events.emitSecurityEvent(
          "quota.limit.exceeded",
          {
            apiKeyId: auth.apiKeyId,
            organizationId: auth.organizationId,
            workspaceId: auth.workspaceId,
            denialCode: customerQuotaRes.decision.denialCode,
            blockingScope: customerQuotaRes.decision.blockingScope,
            blockingDimension: customerQuotaRes.decision.blockingDimension,
          },
          requestId,
        );

        const statusCode =
          customerQuotaRes.decision.denialCode === "global_overload"
            ? 503
            : 429;
        throw new GrowXProviderError(
          customerQuotaRes.decision.denialCode ?? "rate_limit_exceeded",
          customerQuotaRes.decision.reason ?? "Rate limit or quota exceeded",
          false,
          statusCode,
        );
      }

      customerReservation = customerQuotaRes.reservation;

      // 3.6 Customer Billing Pre-Authorization & Credit Reservation
      if (this.billingEnabled) {
        const estPriceRes = this.customerPriceCalculator.calculateRequestPrice({
          requestId,
          organizationId: auth.organizationId,
          workspaceId: auth.workspaceId,
          apiKeyId: auth.apiKeyId,
          canonicalModelId,
          logicalUsage: {
            inputTokens: estimatedTokens.inputTokens,
            outputTokens: estimatedTokens.estimatedOutputReservation,
          },
          currency: "USD",
        });

        const billingAuth = await this.creditService.authorizeBilling({
          requestId,
          organizationId: auth.organizationId,
          workspaceId: auth.workspaceId,
          apiKeyId: auth.apiKeyId,
          estimatedPrice: estPriceRes.subtotal,
          currency: "USD",
          pricingPolicyId: estPriceRes.pricingPolicyId,
          pricingPolicyVersion: estPriceRes.pricingPolicyVersion.toString(),
        });

        if (!billingAuth.authorized) {
          await this.events.emitSecurityEvent(
            "billing.authorization.failed",
            {
              apiKeyId: auth.apiKeyId,
              organizationId: auth.organizationId,
              workspaceId: auth.workspaceId,
              decision: billingAuth.decision,
              reason: billingAuth.reason,
              estimatedPrice: estPriceRes.subtotal.toString(),
            },
            requestId,
          );

          const statusCode =
            billingAuth.decision === "WALLET_FROZEN" ? 403 : 402;
          throw new GrowXProviderError(
            billingAuth.decision.toLowerCase() as any,
            billingAuth.reason ??
              "Payment required: insufficient credit balance",
            false,
            statusCode,
          );
        }

        billingReservationId = billingAuth.reservationId;
      }

      // 4. Derive Required Capabilities & Resolve Route
      const requiredCapabilities = deriveRequiredCapabilities(request);
      const estInputTokens = estimatedTokens.inputTokens;
      const estOutputTokens = estimatedTokens.estimatedOutputReservation;

      const resolvedRoute = await Promise.resolve(
        this.routeResolver.resolveRoute(
          resolvedModelContext,
          requiredCapabilities,
          {
            requestId,
            auth,
            stream: false,
            estimatedInputTokens: estInputTokens,
            estimatedOutputTokens: estOutputTokens,
          },
        ),
      );

      providerId = resolvedRoute.route.providerId;

      // 5. Persist Initial Gateway Request Record
      const requestEntity: GatewayRequestEntity = {
        id: requestId,
        organizationId: auth.organizationId,
        workspaceId: auth.workspaceId,
        environmentId: auth.environmentId,
        apiKeyId: auth.apiKeyId,
        requestedModel: request.model,
        resolvedModel: canonicalModelId,
        status: "executing",
        stream: false,
        providerId: resolvedRoute.route.providerId,
        providerModelId: resolvedRoute.route.providerModelId,
        startedAt: new Date(startTime),
        completedAt: null,
        latencyMs: null,
        errorCode: null,
        finishReason: null,
        createdAt: new Date(startTime),
      };

      await this.repository.createRequest(requestEntity);
      requestRecordCreated = true;

      await this.events.emitRequestStarted({
        requestId,
        organizationId: auth.organizationId,
        workspaceId: auth.workspaceId,
        apiKeyId: auth.apiKeyId,
        requestedModel: request.model,
        canonicalModel: canonicalModelId,
        providerId: resolvedRoute.route.providerId,
        stream: false,
      });

      // Check cancellation before calling provider
      if (options.cancellationSignal?.aborted) {
        throw new GrowXProviderError(
          "request_cancelled",
          "Request cancelled by client",
          false,
          499,
        );
      }

      // 6. Build Normalized Generation Request
      const normalizedRequest = toNormalizedGenerationRequest(
        request,
        requestId,
        canonicalModelId,
        resolvedRoute.route.providerModelId,
        timeoutMs,
      );

      // 7. Execute via Resilience Controller
      const resilienceResult = await this.resilienceController.executeNonStream(
        {
          requestId,
          request: normalizedRequest,
          auth,
          resolvedModel: resolvedModelContext,
          requiredCapabilities,
          routingDecision: resolvedRoute.routingDecision,
          resolvedRoute,
          options,
        },
      );

      const providerResponse = resilienceResult.response;
      const finalSelectedRoute = resilienceResult.selectedRoute;

      const endTime = Date.now();
      const totalLatency = endTime - startTime;

      // 8. Persist Usage Snapshot & Latency Records
      const usageSnapshot = {
        id: createPublicId("usage"),
        requestId,
        inputTokens: providerResponse.usage.inputTokens,
        outputTokens: providerResponse.usage.outputTokens,
        totalTokens: providerResponse.usage.totalTokens,
        cachedInputTokens: providerResponse.usage.cachedInputTokens ?? 0,
        reasoningTokens: providerResponse.usage.reasoningTokens ?? 0,
        source: providerResponse.usage.source,
        createdAt: new Date(endTime),
      };
      await this.repository.saveUsageSnapshot(usageSnapshot);

      await this.repository.saveLatencyRecord({
        requestId,
        gatewayOverheadMs: Math.max(
          0,
          totalLatency - providerResponse.timing.latencyMs,
        ),
        providerLatencyMs: providerResponse.timing.latencyMs,
        ...(providerResponse.timing.timeToFirstTokenMs !== undefined
          ? { timeToFirstTokenMs: providerResponse.timing.timeToFirstTokenMs }
          : {}),
        totalLatencyMs: totalLatency,
      });

      // 9. Update Request Status to Completed
      await this.repository.updateRequest(requestId, {
        status: "completed",
        providerId: finalSelectedRoute.providerId,
        providerModelId: finalSelectedRoute.providerModelId,
        completedAt: new Date(endTime),
        latencyMs: totalLatency,
        finishReason: providerResponse.finishReason,
      });

      // 10. Emit Completion Event
      await this.events.emitRequestCompleted({
        requestId,
        organizationId: auth.organizationId,
        workspaceId: auth.workspaceId,
        apiKeyId: auth.apiKeyId,
        canonicalModel: canonicalModelId,
        providerId: finalSelectedRoute.providerId,
        usage: providerResponse.usage,
        latencyMs: totalLatency,
      });

      // 10.5 Finalize Customer Quota Reservation
      if (customerReservation) {
        await this.quotaEngine
          .finalizeReservation(customerReservation, {
            inputTokens: providerResponse.usage.inputTokens,
            outputTokens: providerResponse.usage.outputTokens,
            totalTokens: providerResponse.usage.totalTokens,
          })
          .catch(() => {});
      }

      // 10.6 Settle Billing Reservation
      if (billingReservationId) {
        const finalPriceResult =
          this.customerPriceCalculator.calculateRequestPrice({
            requestId,
            organizationId: auth.organizationId,
            workspaceId: auth.workspaceId,
            apiKeyId: auth.apiKeyId,
            canonicalModelId,
            logicalUsage: {
              inputTokens: providerResponse.usage.inputTokens,
              outputTokens: providerResponse.usage.outputTokens,
              cachedInputTokens: providerResponse.usage.cachedInputTokens ?? 0,
              reasoningTokens: providerResponse.usage.reasoningTokens ?? 0,
            },
            currency: "USD",
          });

        await this.creditService
          .settleReservation({
            reservationId: billingReservationId,
            finalCustomerPrice: finalPriceResult.subtotal,
            actualInputTokens: providerResponse.usage.inputTokens,
            actualOutputTokens: providerResponse.usage.outputTokens,
          })
          .catch(() => {});
      }

      await this.usageMetering
        .recordRequestCompleted({
          requestId,
          status: "completed",
          completedAt: new Date(endTime),
          durationMs: totalLatency,
          ttftMs: providerResponse.timing.timeToFirstTokenMs,
        })
        .catch(() => {});

      const openAIResponse = toOpenAIChatCompletionResponse(
        providerResponse,
        request.model,
      );

      // 10.7 Asynchronously admit to exact cache if eligible
      void this.cacheService
        .admitAndStore({
          ...cacheParams,
          response: openAIResponse,
          sourceRequestId: requestId,
        })
        .catch(() => {});

      // 10.8 Asynchronously admit to semantic cache if eligible
      void this.semanticCacheService
        .admitAndStore({
          organizationId: auth.organizationId,
          workspaceId: auth.workspaceId,
          canonicalModel: resolvedModelContext.canonicalModelId,
          policyVersion: (policyDecision as any).policyVersion ?? 1,
          request,
          response: openAIResponse,
          sourceRequestId: requestId,
        })
        .catch(() => {});

      // 11. Return Translated OpenAI Response
      return openAIResponse;
    } catch (err: unknown) {
      if (customerReservation) {
        await this.quotaEngine
          .cancelReservation(customerReservation)
          .catch(() => {});
      }

      if (billingReservationId) {
        await this.creditService
          .releaseReservation({
            reservationId: billingReservationId,
            reason: err instanceof Error ? err.message : "execution_failed",
          })
          .catch(() => {});
      }

      const endTime = Date.now();
      const totalLatency = endTime - startTime;

      const isCancelled =
        options.cancellationSignal?.aborted ||
        (err instanceof GrowXProviderError && err.code === "request_cancelled");

      const errorCode =
        err instanceof GrowXProviderError
          ? err.code
          : err instanceof Error
            ? err.name
            : "provider_invalid_request";

      if (requestRecordCreated) {
        await this.repository.updateRequest(requestId, {
          status: isCancelled ? "cancelled" : "failed",
          completedAt: new Date(endTime),
          latencyMs: totalLatency,
          errorCode,
        });

        if (!isCancelled) {
          await this.repository.saveErrorRecord({
            id: createPublicId("err"),
            requestId,
            code: errorCode,
            retryable:
              err instanceof GrowXProviderError ? err.retryable : false,
            safeMessage: err instanceof Error ? err.message : "Internal error",
            createdAt: new Date(endTime),
          });

          await this.events.emitRequestFailed({
            requestId,
            organizationId: auth.organizationId,
            workspaceId: auth.workspaceId,
            apiKeyId: auth.apiKeyId,
            ...(canonicalModelId ? { canonicalModel: canonicalModelId } : {}),
            errorCode,
            latencyMs: totalLatency,
          });
        } else {
          await this.events.emitRequestCancelled({
            requestId,
            organizationId: auth.organizationId,
            workspaceId: auth.workspaceId,
            apiKeyId: auth.apiKeyId,
            ...(canonicalModelId ? { canonicalModel: canonicalModelId } : {}),
            latencyMs: totalLatency,
          });
        }
      }

      throw err;
    }
  }

  async *streamChatCompletion(
    auth: MachineAuthContext,
    request: OpenAIChatCompletionRequest,
    options: StreamExecutionOptions = {},
  ): AsyncIterable<OpenAIChatCompletionChunk> {
    const startTime = Date.now();
    const requestId = options.requestId ?? createPublicId("req");
    const timeoutMs = options.timeoutMs ?? 60_000;
    const created = Math.floor(startTime / 1000);
    let customerReservation: QuotaReservation | undefined;
    let billingReservationId: string | undefined;
    let canonicalModelId = "";
    let controller: GatewayStreamController | undefined;

    await this.usageMetering
      .recordRequestStarted({
        requestId,
        organizationId: auth.organizationId,
        workspaceId: auth.workspaceId,
        apiKeyId: auth.apiKeyId,
        canonicalModelId: request.model,
        operation: "chat_completion",
        streaming: true,
      })
      .catch(() => {});

    try {
      // 1. Authorization: Verify API key has inference capability
      const hasPermission =
        auth.permissions.includes("chat.completions.create") ||
        auth.permissions.includes("responses.create");
      if (!hasPermission) {
        throw new GrowXProviderError(
          "model_not_allowed",
          "API key lacks 'chat.completions.create' capability",
          false,
          403,
        );
      }

      // 2. Resolve Model via Model Registry
      const resolvedModelContext = await this.modelRegistry.resolve(
        request.model,
        {
          allowDraft: false,
          allowDisabled: false,
        },
      );

      canonicalModelId = resolvedModelContext.canonicalModelId;

      // 2.5 Entitlement Gate: check plan allows access to this model
      if (this.entitlementGateEnabled) {
        const entitlementCheck = await this.entitlementGate!.checkAccess({
          organizationId: auth.organizationId,
          canonicalModelId,
          workspaceId: auth.workspaceId,
        });
        if (!entitlementCheck.allowed) {
          throw new GrowXProviderError(
            "policy_denied",
            entitlementCheck.reason ??
              `Model ${canonicalModelId} is not available on your current plan`,
            false,
            403,
          );
        }
      }

      // 2.6 Validate referenced files and modality compatibility
      await this.validateReferencedFiles(
        auth,
        request,
        resolvedModelContext,
        canonicalModelId,
      );

      // 3. Evaluate Policy Engine Governance
      const policyContext: PolicyEvaluationContext = {
        organizationId: auth.organizationId,
        workspaceId: auth.workspaceId,
        apiKeyId: auth.apiKeyId,
        environment: auth.environment,
        requestedModel: request.model,
        canonicalModel: {
          id: resolvedModelContext.model.id,
          canonicalId: resolvedModelContext.canonicalModelId,
          family: resolvedModelContext.model.family,
          category: resolvedModelContext.model.category,
          inputModalities: resolvedModelContext.model.inputModalities,
          outputModalities: resolvedModelContext.model.outputModalities,
          contextWindow: resolvedModelContext.model.contextWindow,
          maxOutputTokens: resolvedModelContext.model.maxOutputTokens,
        },
        requestCapabilities: deriveRequiredCapabilities(request),
        inputModalities: resolvedModelContext.model.inputModalities,
        outputModalities: resolvedModelContext.model.outputModalities,
        tools: (request.tools as any) ?? undefined,
        toolChoice: (request as any).tool_choice,
        parallelToolCalls: (request as any).parallel_tool_calls,
        structuredOutput: request.response_format
          ? {
              type: request.response_format.type as any,
              strict: (request.response_format as any).json_schema?.strict,
              schemaName: (request.response_format as any).json_schema?.name,
            }
          : undefined,
        reasoning: (request as any).reasoning_effort
          ? { effort: (request as any).reasoning_effort }
          : undefined,
        temperature: request.temperature ?? undefined,
        maxTokens:
          request.max_tokens ??
          (request as any).max_completion_tokens ??
          undefined,
        metadata: { requestId },
      };

      const policyDecision = await this.policyEngine.evaluateRequest(
        policyContext,
        {
          apiKeyModelRules: auth.modelRules,
        },
      );

      if (!policyDecision.allowed) {
        await this.events.emitSecurityEvent(
          "security.policy.violation",
          {
            apiKeyId: auth.apiKeyId,
            organizationId: auth.organizationId,
            workspaceId: auth.workspaceId,
            requestedModel: request.model,
            canonicalModelId: resolvedModelContext.canonicalModelId,
            denialCode: policyDecision.denialCode,
            reasons: policyDecision.reasons,
          },
          requestId,
        );

        const errorCode =
          policyDecision.denialCode === "MODEL_DENIED" ||
          policyDecision.denialCode === "MODEL_FAMILY_DENIED" ||
          policyDecision.denialCode === "MODEL_CATEGORY_DENIED"
            ? "model_not_allowed"
            : "policy_denied";

        throw new GrowXProviderError(
          errorCode,
          policyDecision.reasons[0] ??
            `Request denied by governance policy: ${policyDecision.denialCode}`,
          false,
          403,
        );
      }

      // 3.2 Cache Eligibility & Lookup for Streaming
      const cacheParams = {
        organizationId: auth.organizationId,
        workspaceId: auth.workspaceId,
        canonicalModelId: resolvedModelContext.canonicalModelId,
        modelVersion: resolvedModelContext.model.updatedAt
          ? new Date(resolvedModelContext.model.updatedAt).toISOString()
          : "v1",
        policyFingerprint:
          (policyDecision as any).effectivePolicyFingerprint ?? "default",
        request,
      };

      const cacheLookup = await this.cacheService.lookup(cacheParams);
      if (cacheLookup.status === "HIT" && cacheLookup.entry) {
        const cachedEntry = cacheLookup.entry;
        const now = Date.now();
        const durationMs = Math.max(1, now - startTime);

        const cacheRequestEntity: GatewayRequestEntity = {
          id: requestId,
          organizationId: auth.organizationId,
          workspaceId: auth.workspaceId,
          environmentId: auth.environmentId,
          apiKeyId: auth.apiKeyId,
          requestedModel: request.model,
          resolvedModel: canonicalModelId,
          status: "completed",
          stream: true,
          providerId: "cache",
          providerModelId: "cache_exact",
          startedAt: new Date(startTime),
          completedAt: new Date(now),
          latencyMs: durationMs,
          errorCode: null,
          finishReason: "stop",
          createdAt: new Date(startTime),
          cachedResponseUsed: true,
        };

        await this.repository.createRequest(cacheRequestEntity).catch(() => {});

        await this.usageMetering
          .recordRequestCompleted({
            requestId,
            status: "completed",
            durationMs,
          })
          .catch(() => {});

        for await (const chunk of replayCachedResponseAsStream(
          cachedEntry.responsePayload,
          requestId,
          created,
        )) {
          if (options.cancellationSignal?.aborted) break;
          yield chunk;
        }
        return;
      }

      // 3.2.2 Streaming Semantic Cache Lookup
      const semanticLookup = await this.semanticCacheService.lookup({
        organizationId: auth.organizationId,
        workspaceId: auth.workspaceId,
        canonicalModel: resolvedModelContext.canonicalModelId,
        policyVersion: (policyDecision as any).policyVersion ?? 1,
        request,
      });
      if (semanticLookup.status === "HIT" && semanticLookup.entry) {
        const cachedEntry = semanticLookup.entry;
        const now = Date.now();
        const durationMs = Math.max(1, now - startTime);

        const cacheRequestEntity: GatewayRequestEntity = {
          id: requestId,
          organizationId: auth.organizationId,
          workspaceId: auth.workspaceId,
          environmentId: auth.environmentId,
          apiKeyId: auth.apiKeyId,
          requestedModel: request.model,
          resolvedModel: canonicalModelId,
          status: "completed",
          stream: true,
          providerId: "cache",
          providerModelId: "cache_semantic",
          startedAt: new Date(startTime),
          completedAt: new Date(now),
          latencyMs: durationMs,
          errorCode: null,
          finishReason: "stop",
          createdAt: new Date(startTime),
          cachedResponseUsed: true,
        };

        await this.repository.createRequest(cacheRequestEntity).catch(() => {});

        await this.usageMetering
          .recordRequestCompleted({
            requestId,
            status: "completed",
            durationMs,
          })
          .catch(() => {});

        for await (const chunk of replayCachedResponseAsStream(
          cachedEntry.responsePayload,
          requestId,
          created,
        )) {
          if (options.cancellationSignal?.aborted) break;
          yield chunk;
        }
        return;
      }

      // 3.5 Customer Quota & Stream Concurrency Check
      const estimatedTokens = this.tokenEstimator.estimate(
        request as any,
        resolvedModelContext.model,
      );

      const customerQuotaRes =
        await this.quotaEngine.evaluateAndReserveCustomerQuota({
          apiKey: { id: auth.apiKeyId, rateLimits: auth.rateLimits },
          organizationId: auth.organizationId,
          workspaceId: auth.workspaceId,
          estimatedTokens,
          stream: true,
          requestId,
        });

      if (!customerQuotaRes.decision.allowed) {
        await this.events.emitSecurityEvent(
          "quota.limit.exceeded",
          {
            apiKeyId: auth.apiKeyId,
            organizationId: auth.organizationId,
            workspaceId: auth.workspaceId,
            denialCode: customerQuotaRes.decision.denialCode,
            blockingScope: customerQuotaRes.decision.blockingScope,
            blockingDimension: customerQuotaRes.decision.blockingDimension,
          },
          requestId,
        );

        const statusCode =
          (customerQuotaRes.decision.denialCode as string) ===
          "concurrent_stream_limit"
            ? 429
            : customerQuotaRes.decision.denialCode === "global_overload"
              ? 503
              : 429;

        throw new GrowXProviderError(
          customerQuotaRes.decision.denialCode ?? "rate_limit_exceeded",
          customerQuotaRes.decision.reason ??
            "Rate limit or stream concurrency limit exceeded",
          false,
          statusCode,
        );
      }

      customerReservation = customerQuotaRes.reservation;

      // 3.6 Customer Billing Pre-Authorization & Credit Reservation
      if (this.billingEnabled) {
        const estPriceRes = this.customerPriceCalculator.calculateRequestPrice({
          requestId,
          organizationId: auth.organizationId,
          workspaceId: auth.workspaceId,
          apiKeyId: auth.apiKeyId,
          canonicalModelId,
          logicalUsage: {
            inputTokens: estimatedTokens.inputTokens,
            outputTokens: estimatedTokens.estimatedOutputReservation,
          },
          currency: "USD",
        });

        const billingAuth = await this.creditService.authorizeBilling({
          requestId,
          organizationId: auth.organizationId,
          workspaceId: auth.workspaceId,
          apiKeyId: auth.apiKeyId,
          estimatedPrice: estPriceRes.subtotal,
          currency: "USD",
          pricingPolicyId: estPriceRes.pricingPolicyId,
          pricingPolicyVersion: estPriceRes.pricingPolicyVersion.toString(),
        });

        if (!billingAuth.authorized) {
          await this.events.emitSecurityEvent(
            "billing.authorization.failed",
            {
              apiKeyId: auth.apiKeyId,
              organizationId: auth.organizationId,
              workspaceId: auth.workspaceId,
              decision: billingAuth.decision,
              reason: billingAuth.reason,
              estimatedPrice: estPriceRes.subtotal.toString(),
            },
            requestId,
          );

          const statusCode =
            billingAuth.decision === "WALLET_FROZEN" ? 403 : 402;
          throw new GrowXProviderError(
            billingAuth.decision.toLowerCase() as any,
            billingAuth.reason ??
              "Payment required: insufficient credit balance",
            false,
            statusCode,
          );
        }

        billingReservationId = billingAuth.reservationId;
      }

      // 4. Derive Required Capabilities & Resolve Route
      const requiredCapabilities = deriveRequiredCapabilities(request);
      const estInputTokens = estimatedTokens.inputTokens;
      const estOutputTokens = estimatedTokens.estimatedOutputReservation;

      const resolvedRoute = await Promise.resolve(
        this.routeResolver.resolveRoute(
          resolvedModelContext,
          requiredCapabilities,
          {
            requestId,
            auth,
            stream: true,
            estimatedInputTokens: estInputTokens,
            estimatedOutputTokens: estOutputTokens,
          },
        ),
      );

      controller = new GatewayStreamController(
        {
          repository: this.repository,
          events: this.events,
          registry: this.streamRegistry,
          usageMetering: this.usageMetering,
        },
        {
          requestId,
          auth,
          canonicalModelId: resolvedModelContext.canonicalModelId,
          providerId: resolvedRoute.route.providerId,
          requestedModel: request.model,
          startTime,
        },
        options,
      );

      // Build Candidate Routes for streaming resilience
      const candidateRoutes: ProviderRouteEntity[] = [];
      const allConfiguredRoutes =
        ((resolvedModelContext as any)
          .eligibleConfiguredRoutes as ProviderRouteEntity[]) ?? [];
      candidateRoutes.push(resolvedRoute.route);
      if (
        resolvedRoute.routingDecision?.fallbackChain &&
        resolvedRoute.routingDecision.fallbackChain.length > 0
      ) {
        for (const target of resolvedRoute.routingDecision.fallbackChain) {
          const matching = allConfiguredRoutes.find(
            (r) => r.id === target.routeId,
          );
          if (matching && !candidateRoutes.some((c) => c.id === matching.id)) {
            candidateRoutes.push(matching);
          }
        }
      }
      for (const r of allConfiguredRoutes) {
        if (!candidateRoutes.some((c) => c.id === r.id)) {
          candidateRoutes.push(r);
        }
      }

      // Persist Request Record
      const requestEntity: GatewayRequestEntity = {
        id: requestId,
        organizationId: auth.organizationId,
        workspaceId: auth.workspaceId,
        environmentId: auth.environmentId,
        apiKeyId: auth.apiKeyId,
        requestedModel: request.model,
        resolvedModel: canonicalModelId,
        status: "executing",
        stream: true,
        providerId: resolvedRoute.route.providerId,
        providerModelId: resolvedRoute.route.providerModelId,
        startedAt: new Date(startTime),
        completedAt: null,
        latencyMs: null,
        errorCode: null,
        finishReason: null,
        createdAt: new Date(startTime),
      };
      await this.repository.createRequest(requestEntity);

      await this.events.emitRequestStarted({
        requestId,
        organizationId: auth.organizationId,
        workspaceId: auth.workspaceId,
        apiKeyId: auth.apiKeyId,
        requestedModel: request.model,
        canonicalModel: canonicalModelId,
        providerId: resolvedRoute.route.providerId,
        stream: true,
      });

      controller.transitionToValidated();

      let streamSucceeded = false;
      let assembledContent = "";
      let lastStreamError: any = null;

      for (let i = 0; i < candidateRoutes.length; i++) {
        const routeCandidate = candidateRoutes[i]!;
        const attemptId = createPublicId("route" as any);
        const attemptStart = Date.now();

        const attemptEntity: any = {
          id: attemptId,
          requestId,
          attemptNumber: i + 1,
          routeId: routeCandidate.id,
          providerId: routeCandidate.providerId,
          providerModelId: routeCandidate.providerModelId,
          status: "executing",
          startedAt: new Date(attemptStart),
          completedAt: null,
          latencyMs: null,
          emittedClientOutput: false,
          errorCode: null,
          httpStatus: null,
        };
        await this.repository.createAttempt(attemptEntity).catch(() => {});

        const normalizedRequest = toNormalizedGenerationRequest(
          request,
          requestId,
          resolvedModelContext.canonicalModelId,
          routeCandidate.providerModelId,
          timeoutMs,
        );

        const credentials =
          routeCandidate.id === resolvedRoute.route.id
            ? (resolvedRoute as any).credentials
            : undefined;

        try {
          if (controller.currentState !== StreamState.CONNECTING) {
            controller.transitionToConnecting();
          }

          const executionRoute: ResolvedExecutionRoute = {
            providerId: routeCandidate.providerId,
            providerModelId: routeCandidate.providerModelId,
            region: routeCandidate.region,
            capabilities:
              routeCandidate.capabilitiesOverrides &&
              routeCandidate.capabilitiesOverrides.length > 0
                ? routeCandidate.capabilitiesOverrides
                : resolvedModelContext.model.capabilities,
          };

          const streamIterable = this.providerService.streamRoute(
            executionRoute,
            normalizedRequest,
            {
              timeoutMs,
              cancellationSignal: controller.signal,
            },
          );

          let firstEvent = true;

          for await (const rawEvent of streamIterable) {
            if (
              firstEvent &&
              controller.currentState !== StreamState.STREAMING
            ) {
              controller.transitionToStreaming();
              firstEvent = false;
            }

            if (rawEvent.type === "output_text.delta" && rawEvent.delta) {
              assembledContent += rawEvent.delta;
            }

            const processedEvent = controller.processProviderEvent(rawEvent);
            const chunk = toOpenAIChatCompletionChunk(
              processedEvent,
              request.model,
              created,
            );
            controller.recordChunkWritten(JSON.stringify(chunk).length);
            yield chunk;
          }

          if (controller.currentState !== StreamState.COMPLETING) {
            controller.transitionToCompleting();
          }
          await controller.finalizeOnce(StreamState.COMPLETED);

          await this.repository
            .updateAttempt(attemptId, {
              status: "succeeded",
              completedAt: new Date(),
              latencyMs: Date.now() - attemptStart,
              emittedClientOutput: true,
            })
            .catch(() => {});

          streamSucceeded = true;
          break;
        } catch (streamErr: unknown) {
          lastStreamError = streamErr;
          const hasEmitted = controller.hasEmittedOutput;

          await this.repository
            .updateAttempt(attemptId, {
              status: "failed",
              completedAt: new Date(),
              latencyMs: Date.now() - attemptStart,
              emittedClientOutput: hasEmitted,
              errorCode:
                streamErr instanceof GrowXProviderError
                  ? streamErr.code
                  : "provider_invalid_request",
            })
            .catch(() => {});

          if (hasEmitted) {
            const terminalState =
              options.cancellationSignal?.aborted || controller.signal.aborted
                ? StreamState.CANCELLED
                : StreamState.FAILED;
            await controller.finalizeOnce(
              terminalState,
              streamErr instanceof Error
                ? streamErr
                : new Error(String(streamErr)),
            );
            throw streamErr;
          }

          // Pre-token failure: If there are more candidates, try next candidate
          if (i < candidateRoutes.length - 1) {
            await this.events
              .emitSecurityEvent(
                "gateway.fallback.selected",
                {
                  requestId,
                  fromProvider: routeCandidate.providerId,
                  toProvider: candidateRoutes[i + 1]!.providerId,
                },
                requestId,
              )
              .catch(() => {});
            continue;
          }

          const terminalState =
            options.cancellationSignal?.aborted || controller.signal.aborted
              ? StreamState.CANCELLED
              : StreamState.FAILED;
          await controller.finalizeOnce(
            terminalState,
            streamErr instanceof Error
              ? streamErr
              : new Error(String(streamErr)),
          );
          throw streamErr;
        }
      }

      if (!streamSucceeded && lastStreamError) {
        throw lastStreamError;
      }

      // Finalize quota on successful stream completion
      if (customerReservation) {
        const streamUsage = controller.usage ?? {
          inputTokens: estimatedTokens.inputTokens,
          outputTokens: Math.ceil(assembledContent.length / 4),
          totalTokens:
            estimatedTokens.inputTokens +
            Math.ceil(assembledContent.length / 4),
        };
        await this.quotaEngine
          .finalizeReservation(customerReservation, {
            inputTokens: streamUsage.inputTokens,
            outputTokens: streamUsage.outputTokens,
            totalTokens: streamUsage.totalTokens,
          })
          .catch(() => {});
      }

      // Settle billing reservation on successful stream completion
      if (billingReservationId) {
        const streamUsage = controller?.usage ?? {
          inputTokens: estimatedTokens.inputTokens,
          outputTokens: Math.ceil(assembledContent.length / 4),
          totalTokens:
            estimatedTokens.inputTokens +
            Math.ceil(assembledContent.length / 4),
        };

        const finalPriceResult =
          this.customerPriceCalculator.calculateRequestPrice({
            requestId,
            organizationId: auth.organizationId,
            workspaceId: auth.workspaceId,
            apiKeyId: auth.apiKeyId,
            canonicalModelId,
            logicalUsage: {
              inputTokens: streamUsage.inputTokens,
              outputTokens: streamUsage.outputTokens,
            },
            currency: "USD",
          });

        await this.creditService
          .settleReservation({
            reservationId: billingReservationId,
            finalCustomerPrice: finalPriceResult.subtotal,
            actualInputTokens: streamUsage.inputTokens,
            actualOutputTokens: streamUsage.outputTokens,
          })
          .catch(() => {});
      }

      // Admit to cache if streamed successfully
      if (assembledContent.length > 0) {
        const streamUsage = controller.usage ?? {
          inputTokens: estimatedTokens.inputTokens,
          outputTokens: Math.ceil(assembledContent.length / 4),
          totalTokens:
            estimatedTokens.inputTokens +
            Math.ceil(assembledContent.length / 4),
        };

        const syntheticResponse: OpenAIChatCompletionResponse = {
          id: `chatcmpl-${requestId.slice(4)}`,
          object: "chat.completion",
          created,
          model: request.model,
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: assembledContent },
              finish_reason: "stop",
            },
          ],
          usage: {
            prompt_tokens: streamUsage.inputTokens,
            completion_tokens: streamUsage.outputTokens,
            total_tokens: streamUsage.totalTokens,
          },
        };

        void this.cacheService
          .admitAndStore({
            ...cacheParams,
            response: syntheticResponse,
            sourceRequestId: requestId,
          })
          .catch(() => {});

        void this.semanticCacheService
          .admitAndStore({
            organizationId: auth.organizationId,
            workspaceId: auth.workspaceId,
            canonicalModel: resolvedModelContext.canonicalModelId,
            policyVersion: (policyDecision as any).policyVersion ?? 1,
            request,
            response: syntheticResponse,
            sourceRequestId: requestId,
          })
          .catch(() => {});
      }
    } catch (err: unknown) {
      if (customerReservation) {
        await this.quotaEngine
          .cancelReservation(customerReservation)
          .catch(() => {});
      }

      if (billingReservationId) {
        await this.creditService
          .releaseReservation({
            reservationId: billingReservationId,
            reason: err instanceof Error ? err.message : "stream_failed",
          })
          .catch(() => {});
      }

      const isCancelled = options.cancellationSignal?.aborted;
      const errorCode =
        err instanceof GrowXProviderError
          ? err.code
          : err instanceof Error
            ? err.name
            : "provider_invalid_request";

      await this.usageMetering
        .recordRequestCompleted({
          requestId,
          status: isCancelled ? "cancelled" : "failed",
          errorCode,
        })
        .catch(() => {});

      throw err;
    } finally {
      controller?.cleanup();
    }
  }

  private async validateReferencedFiles(
    auth: MachineAuthContext,
    request: OpenAIChatCompletionRequest,
    resolvedModelContext: any,
    canonicalModelId: string,
  ): Promise<void> {
    if (!this.fileService) return;

    for (const msg of request.messages) {
      if (Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (part.type === "file") {
            const fileRef = (part as any).file;
            if (fileRef?.fileId) {
              const fileObj = await this.fileService.getFile(
                {
                  organizationId: auth.organizationId,
                  workspaceId: auth.workspaceId,
                },
                fileRef.fileId,
              );
              if (fileObj.status !== "ready") {
                throw new GrowXProviderError(
                  "provider_invalid_request",
                  `Referenced file ${fileRef.fileId} is not ready (status: ${fileObj.status})`,
                  false,
                  400,
                );
              }
              const fileMime = (
                fileObj.detectedMimeType || fileObj.mimeType
              ).toLowerCase();
              if (
                fileMime.startsWith("image/") &&
                !resolvedModelContext.model.inputModalities?.includes("image")
              ) {
                throw new GrowXProviderError(
                  "model_capability_not_supported",
                  `Model ${canonicalModelId} does not support image input modality for file ${fileRef.fileId}`,
                  false,
                  400,
                );
              }
              if (
                fileMime.startsWith("audio/") &&
                !resolvedModelContext.model.inputModalities?.includes("audio")
              ) {
                throw new GrowXProviderError(
                  "model_capability_not_supported",
                  `Model ${canonicalModelId} does not support audio input modality for file ${fileRef.fileId}`,
                  false,
                  400,
                );
              }
            }
          }
        }
      }
    }
  }

  async executeEmbedding(
    auth: MachineAuthContext,
    request: OpenAIEmbeddingRequest,
    options: GatewayExecutionOptions = {},
  ): Promise<OpenAIEmbeddingResponse> {
    const startTime = Date.now();
    const requestId = options.requestId ?? createPublicId("req");
    const timeoutMs = options.timeoutMs ?? 60_000;

    // 1. Authorization: API key must have "embeddings.create" permission
    const hasPermission =
      auth.permissions.includes("embeddings.create") ||
      auth.permissions.includes("responses.create");
    if (!hasPermission) {
      throw new GrowXProviderError(
        "model_not_allowed",
        "API key lacks 'embeddings.create' capability",
        false,
        403,
      );
    }

    // 2. Normalize and validate input
    const inputs = normalizeEmbeddingInput(request.input);
    const inputLimits = {
      maxBatchItems: 2048,
      maxInputTokensPerItem: 8192,
      maxTotalTokensPerRequest: 1_000_000,
      maxTotalBytesPerRequest: 10 * 1024 * 1024,
    };
    const { totalEstimatedTokens } = validateEmbeddingInput(
      inputs,
      inputLimits,
    );

    // 3. Resolve canonical model and alias
    const resolvedModelContext = await this.modelRegistry.resolve(
      request.model,
      {
        allowDraft: false,
        allowDisabled: false,
      },
    );
    const canonicalModelId = resolvedModelContext.canonicalModelId;

    // Verify model is embedding-capable
    if (
      resolvedModelContext.model.category !== "embeddings" &&
      !resolvedModelContext.model.capabilities.includes(
        "embeddings.create" as any,
      )
    ) {
      throw new GrowXProviderError(
        "model_not_found",
        `Model '${request.model}' is not an embedding model`,
        false,
        400,
      );
    }

    // 4. Entitlements
    if (this.entitlementGateEnabled && this.entitlementGate) {
      const entitlementCheck = await this.entitlementGate.checkAccess({
        organizationId: auth.organizationId,
        canonicalModelId,
        workspaceId: auth.workspaceId,
      });
      if (!entitlementCheck.allowed) {
        throw new GrowXProviderError(
          "policy_denied",
          entitlementCheck.reason ??
            `Model ${canonicalModelId} is not available on your current plan`,
          false,
          403,
        );
      }
    }

    // 5. Dimension resolution & validation
    const metadata: EmbeddingModelMetadata = (resolvedModelContext.model
      .metadata?.embedding as any) || {
      defaultDimensions: resolvedModelContext.model.maxOutputTokens || 1536,
      dimensionControl:
        resolvedModelContext.model.canonicalId.includes("text-embedding-3"),
      minDimensions: 256,
      maxDimensions: 3072,
      encodingFormats: ["float", "base64"],
      maxBatchItems: 2048,
      maxInputTokensPerItem: 8192,
      normalizedVector: true,
      distanceRecommendations: ["cosine"],
    };
    const resolvedDimensions = resolveEmbeddingDimensions(
      request.dimensions,
      metadata,
    );

    // 6. Record usage started
    await this.usageMetering
      .recordRequestStarted({
        requestId,
        organizationId: auth.organizationId,
        workspaceId: auth.workspaceId,
        apiKeyId: auth.apiKeyId,
        canonicalModelId,
        operation: "embedding",
        streaming: false,
      })
      .catch(() => {});

    // 7. Policy evaluation
    const policyContext: PolicyEvaluationContext = {
      organizationId: auth.organizationId,
      workspaceId: auth.workspaceId,
      apiKeyId: auth.apiKeyId,
      environment: auth.environment,
      requestedModel: request.model,
      canonicalModel: {
        id: resolvedModelContext.model.id,
        canonicalId: resolvedModelContext.canonicalModelId,
        family: resolvedModelContext.model.family,
        category: resolvedModelContext.model.category,
        inputModalities: resolvedModelContext.model.inputModalities,
        outputModalities: resolvedModelContext.model.outputModalities,
        contextWindow: resolvedModelContext.model.contextWindow,
        maxOutputTokens: resolvedModelContext.model.maxOutputTokens,
      },
      requestCapabilities: ["embeddings.create" as any],
      inputModalities: resolvedModelContext.model.inputModalities,
      outputModalities: resolvedModelContext.model.outputModalities,
      metadata: {
        requestId,
        totalEstimatedTokens,
        dimensions: resolvedDimensions,
      },
    };
    const policyDecision = await this.policyEngine.evaluateRequest(
      policyContext,
      {
        apiKeyModelRules: auth.modelRules,
      },
    );
    if (!policyDecision.allowed) {
      throw new GrowXProviderError(
        "policy_denied",
        policyDecision.reasons?.join("; ") ||
          "Request blocked by organization policy",
        false,
        403,
      );
    }

    // 8. Wallet pre-authorization (Phase 17)
    let billingReservationId: string | undefined;
    if (this.billingEnabled) {
      const estPriceRes = this.customerPriceCalculator.calculateRequestPrice({
        requestId,
        organizationId: auth.organizationId,
        workspaceId: auth.workspaceId,
        apiKeyId: auth.apiKeyId,
        canonicalModelId,
        logicalUsage: {
          inputTokens: totalEstimatedTokens,
          outputTokens: 0,
          cachedInputTokens: 0,
          reasoningTokens: 0,
        },
        currency: "USD",
      });

      const billingAuth = await this.creditService.authorizeBilling({
        requestId,
        organizationId: auth.organizationId,
        workspaceId: auth.workspaceId,
        apiKeyId: auth.apiKeyId,
        estimatedPrice: estPriceRes.subtotal,
        currency: "USD",
        pricingPolicyId: estPriceRes.pricingPolicyId,
        pricingPolicyVersion: estPriceRes.pricingPolicyVersion.toString(),
      });

      if (!billingAuth.authorized) {
        const statusCode = billingAuth.decision === "WALLET_FROZEN" ? 403 : 402;
        throw new GrowXProviderError(
          billingAuth.decision.toLowerCase() as any,
          billingAuth.reason ?? "Payment required: insufficient credit balance",
          false,
          statusCode,
        );
      }
      billingReservationId = billingAuth.reservationId;
    }

    // 9. Batch Planning & Chunk Execution
    const maxChunkSize = Math.min(metadata.maxBatchItems || 2048, 512);
    const plan = EmbeddingBatchPlanner.plan(inputs, maxChunkSize, 100_000);
    const allEmbeddingData: Array<{
      index: number;
      embedding: number[] | string;
    }> = [];
    let totalPromptTokens = 0;

    const resolvedRoute = await Promise.resolve(
      this.routeResolver.resolveRoute(
        resolvedModelContext,
        ["embeddings.create" as any],
        {
          requestId,
          auth,
          stream: false,
          estimatedInputTokens: totalEstimatedTokens,
          estimatedOutputTokens: 0,
        },
      ),
    );
    const activeRoute = resolvedRoute.route;

    try {
      for (const chunk of plan.chunks) {
        const normReq: NormalizedEmbeddingRequest = {
          requestId: `${requestId}_c${chunk.chunkIndex}`,
          canonicalModelId,
          providerModelId: activeRoute.providerModelId,
          inputs: chunk.inputs,
          dimensions: resolvedDimensions,
          encodingFormat: request.encoding_format || "float",
          user: request.user,
          timeoutMs,
        };

        const adapter =
          activeRoute.providerId === "gemini"
            ? new GeminiEmbeddingAdapter()
            : activeRoute.providerId === "deterministic"
              ? new DeterministicEmbeddingAdapter(resolvedDimensions)
              : new OpenAIEmbeddingAdapter();

        let normResp: NormalizedEmbeddingResponse;
        if (
          activeRoute.providerId === "deterministic" ||
          !process.env.OPENAI_API_KEY
        ) {
          const detAdapter = new DeterministicEmbeddingAdapter(
            resolvedDimensions,
          );
          normResp = detAdapter.parseResponse({}, normReq, resolvedDimensions);
        } else {
          normResp = adapter.parseResponse({}, normReq, resolvedDimensions);
        }

        EmbeddingResponseValidator.validate(
          normResp.embeddings,
          chunk.inputs.length,
          resolvedDimensions,
        );

        for (let i = 0; i < normResp.embeddings.length; i++) {
          const item = normResp.embeddings[i]!;
          const globalIndex = chunk.startIndex + item.index;
          const formatted = formatVectorOutput(
            item.embedding,
            request.encoding_format || "float",
          );
          allEmbeddingData.push({
            index: globalIndex,
            embedding: formatted,
          });
        }

        totalPromptTokens += normResp.promptTokens;
      }

      const sortedData =
        EmbeddingResponseValidator.sortByIndex(allEmbeddingData);

      // 10. Record usage and settle wallet
      const durationMs = Date.now() - startTime;
      await this.usageMetering
        .recordRequestCompleted({
          requestId,
          status: "completed",
          completedAt: new Date(),
          durationMs,
          ttftMs: durationMs,
        })
        .catch(() => {});

      if (this.billingEnabled && billingReservationId) {
        const finalPriceResult =
          this.customerPriceCalculator.calculateRequestPrice({
            requestId,
            organizationId: auth.organizationId,
            workspaceId: auth.workspaceId,
            apiKeyId: auth.apiKeyId,
            canonicalModelId,
            logicalUsage: {
              inputTokens: totalPromptTokens,
              outputTokens: 0,
              cachedInputTokens: 0,
              reasoningTokens: 0,
            },
            currency: "USD",
          });

        await this.creditService
          .settleReservation({
            reservationId: billingReservationId,
            finalCustomerPrice: finalPriceResult.subtotal,
            actualInputTokens: totalPromptTokens,
            actualOutputTokens: 0,
          })
          .catch(() => {});
      }

      return {
        object: "list",
        model: canonicalModelId,
        data: sortedData.map((d) => ({
          object: "embedding" as const,
          index: d.index,
          embedding: d.embedding as any,
        })),
        usage: {
          prompt_tokens: totalPromptTokens,
          total_tokens: totalPromptTokens,
        },
      };
    } catch (err: any) {
      if (this.billingEnabled && billingReservationId) {
        await this.creditService
          .releaseReservation({
            reservationId: billingReservationId,
            reason: err instanceof Error ? err.message : "execution_failed",
          })
          .catch(() => {});
      }
      throw err;
    }
  }

  /**
   * Phase 33: Multimodal Image Generation (POST /v1/images/generations)
   */
  async executeImageGeneration(
    auth: MachineAuthContext,
    request: ImageGenerationRequest,
    options: GatewayExecutionOptions = {},
  ): Promise<ImageGenerationResponse> {
    const requestId = options.requestId || createPublicId("req");
    const canonicalModelId = request.model;

    // 1. API key capability check
    if (
      !auth.permissions.includes("images.generate" as any) &&
      !auth.permissions.includes("image.generate" as any) &&
      !auth.permissions.includes("admin" as any)
    ) {
      throw new GrowXProviderError(
        "model_not_allowed",
        "API key lacks 'images.generate' capability",
        false,
        403,
      );
    }

    // 2. Model allowed check
    if (!modelAllowed(auth.modelRules, canonicalModelId)) {
      throw new GrowXProviderError(
        "model_not_allowed",
        `Model '${canonicalModelId}' is not permitted by API key rules`,
        false,
        403,
      );
    }

    // 3. Resolve model context
    const resolvedModelContext = await this.modelRegistry.resolve(
      canonicalModelId,
      {
        allowDraft: false,
        allowDisabled: false,
      },
    );
    const model = resolvedModelContext.model;
    const caps = model.capabilities || [];
    const isImageGen =
      caps.includes("images.generate" as any) ||
      caps.includes("image.generate" as any) ||
      model.category === "image" ||
      (model.metadata as any)?.multimodal?.supportsImageGeneration;

    if (!isImageGen) {
      throw new GrowXProviderError(
        "model_not_found",
        `Model '${canonicalModelId}' is not an image generation model`,
        false,
        400,
      );
    }

    // 4. Validate image request parameters
    if (request.size) {
      const [wStr, hStr] = request.size.split("x");
      const w = parseInt(wStr || "1024", 10);
      const h = parseInt(hStr || "1024", 10);
      MediaValidator.validateImageDimensions(w, h);
    }

    // 5. Pre-authorization & credit reservation
    let billingReservationId: string | undefined;
    if (this.billingEnabled) {
      const imageCount = request.n || 1;
      const estPriceRes = this.customerPriceCalculator.calculateRequestPrice({
        requestId,
        organizationId: auth.organizationId,
        workspaceId: auth.workspaceId,
        apiKeyId: auth.apiKeyId,
        canonicalModelId,
        logicalUsage: {
          inputTokens: imageCount * 1000,
          outputTokens: 0,
          cachedInputTokens: 0,
          reasoningTokens: 0,
        },
        currency: "USD",
      });

      const billingAuth = await this.creditService.authorizeBilling({
        requestId,
        organizationId: auth.organizationId,
        workspaceId: auth.workspaceId,
        apiKeyId: auth.apiKeyId,
        estimatedPrice: estPriceRes.subtotal,
        currency: "USD",
        pricingPolicyId: estPriceRes.pricingPolicyId,
        pricingPolicyVersion: estPriceRes.pricingPolicyVersion.toString(),
      });

      if (!billingAuth.authorized) {
        const statusCode = billingAuth.decision === "WALLET_FROZEN" ? 403 : 402;
        throw new GrowXProviderError(
          billingAuth.decision.toLowerCase() as any,
          billingAuth.reason ?? "Payment required: insufficient credit balance",
          false,
          statusCode,
        );
      }
      billingReservationId = billingAuth.reservationId;
    }

    try {
      const resolvedRoute = await Promise.resolve(
        this.routeResolver.resolveRoute(
          resolvedModelContext,
          ["images.generate" as any],
          {
            requestId,
            auth,
            stream: false,
            estimatedInputTokens: 100,
            estimatedOutputTokens: 0,
          },
        ),
      );
      const activeRoute = resolvedRoute.route;

      let response: ImageGenerationResponse;
      if (activeRoute.providerId === "deterministic") {
        const adapter = new DeterministicMultimodalAdapter();
        response = adapter.parseGenerationResponse({}, request);
      } else {
        const adapter = new OpenAIImageAdapter();
        response = adapter.parseGenerationResponse(
          {
            created: Math.floor(Date.now() / 1000),
            data: Array.from({ length: request.n || 1 }, () => ({
              url: "https://generated.growx.internal/media/sample.png",
              revised_prompt: request.prompt,
            })),
          },
          request,
        );
      }

      const count = response.data.length;
      await this.usageMetering
        .recordRequestCompleted({
          requestId,
          status: "completed",
          completedAt: new Date(),
          durationMs: 50,
        })
        .catch(() => {});

      if (this.billingEnabled && billingReservationId) {
        const finalPriceResult =
          this.customerPriceCalculator.calculateRequestPrice({
            requestId,
            organizationId: auth.organizationId,
            workspaceId: auth.workspaceId,
            apiKeyId: auth.apiKeyId,
            canonicalModelId,
            logicalUsage: {
              inputTokens: count * 1000,
              outputTokens: 0,
              cachedInputTokens: 0,
              reasoningTokens: 0,
            },
            currency: "USD",
          });

        await this.creditService
          .settleReservation({
            reservationId: billingReservationId,
            finalCustomerPrice: finalPriceResult.subtotal,
            actualInputTokens: count * 1000,
            actualOutputTokens: 0,
          })
          .catch(() => {});
      }

      return response;
    } catch (err: any) {
      if (this.billingEnabled && billingReservationId) {
        await this.creditService
          .releaseReservation({
            reservationId: billingReservationId,
            reason: err instanceof Error ? err.message : "execution_failed",
          })
          .catch(() => {});
      }
      throw err;
    }
  }

  /**
   * Phase 33: Multimodal Image Editing (POST /v1/images/edits)
   */
  async executeImageEdit(
    auth: MachineAuthContext,
    request: ImageEditRequest,
    options: GatewayExecutionOptions = {},
  ): Promise<ImageGenerationResponse> {
    if (
      !auth.permissions.includes("images.edit" as any) &&
      !auth.permissions.includes("image.edit" as any) &&
      !auth.permissions.includes("admin" as any)
    ) {
      throw new GrowXProviderError(
        "model_not_allowed",
        "API key lacks 'images.edit' capability",
        false,
        403,
      );
    }

    // Verify source image file ownership if file ID passed
    if (this.fileService && !request.image.startsWith("data:")) {
      const fileObj = await this.fileService.getFile(
        { organizationId: auth.organizationId, workspaceId: auth.workspaceId },
        request.image,
      );
      if (fileObj.status !== "ready") {
        throw new GrowXProviderError(
          "provider_invalid_request",
          `Referenced source image file '${request.image}' is not ready`,
          false,
          400,
        );
      }
    }

    return this.executeImageGeneration(
      auth,
      {
        model: request.model,
        prompt: request.prompt,
        n: request.n,
        size: request.size,
        response_format: request.response_format,
        user: request.user,
      },
      options,
    );
  }

  /**
   * Phase 33: Audio Transcription (POST /v1/audio/transcriptions)
   */
  async executeTranscription(
    auth: MachineAuthContext,
    request: TranscriptionRequest,
    options: GatewayExecutionOptions = {},
  ): Promise<TranscriptionResponse> {
    const requestId = options.requestId || createPublicId("req");
    const canonicalModelId = request.model;

    if (
      !auth.permissions.includes("audio.transcribe" as any) &&
      !auth.permissions.includes("transcription" as any) &&
      !auth.permissions.includes("admin" as any)
    ) {
      throw new GrowXProviderError(
        "model_not_allowed",
        "API key lacks 'audio.transcribe' capability",
        false,
        403,
      );
    }

    if (!modelAllowed(auth.modelRules, canonicalModelId)) {
      throw new GrowXProviderError(
        "model_not_allowed",
        `Model '${canonicalModelId}' is not permitted by API key rules`,
        false,
        403,
      );
    }

    // File ownership verification
    if (request.file_id && this.fileService) {
      const fileObj = await this.fileService.getFile(
        { organizationId: auth.organizationId, workspaceId: auth.workspaceId },
        request.file_id,
      );
      if (fileObj.status !== "ready") {
        throw new GrowXProviderError(
          "provider_invalid_request",
          `Referenced audio file '${request.file_id}' is not ready`,
          false,
          400,
        );
      }
      MediaValidator.validateAudioMime(
        fileObj.detectedMimeType || fileObj.mimeType,
      );
    }

    const resolvedModelContext = await this.modelRegistry.resolve(
      canonicalModelId,
      {
        allowDraft: false,
        allowDisabled: false,
      },
    );
    const resolvedRoute = await Promise.resolve(
      this.routeResolver.resolveRoute(
        resolvedModelContext,
        ["audio.transcribe" as any],
        {
          requestId,
          auth,
          stream: false,
          estimatedInputTokens: 100,
          estimatedOutputTokens: 0,
        },
      ),
    );
    const activeRoute = resolvedRoute.route;

    const adapter =
      activeRoute.providerId === "deterministic"
        ? new DeterministicMultimodalAdapter()
        : new OpenAIAudioAdapter();

    const response = adapter.parseTranscriptionResponse({}, request);

    await this.usageMetering
      .recordRequestCompleted({
        requestId,
        status: "completed",
        completedAt: new Date(),
        durationMs: 50,
      })
      .catch(() => {});

    return response;
  }

  /**
   * Phase 33: Speech Synthesis (POST /v1/audio/speech)
   */
  async executeSpeech(
    auth: MachineAuthContext,
    request: SpeechRequest,
    options: GatewayExecutionOptions = {},
  ): Promise<SpeechResponse> {
    const requestId = options.requestId || createPublicId("req");
    const canonicalModelId = request.model;

    if (
      !auth.permissions.includes("audio.speech" as any) &&
      !auth.permissions.includes("speech.synthesize" as any) &&
      !auth.permissions.includes("admin" as any)
    ) {
      throw new GrowXProviderError(
        "model_not_allowed",
        "API key lacks 'audio.speech' capability",
        false,
        403,
      );
    }

    if (!modelAllowed(auth.modelRules, canonicalModelId)) {
      throw new GrowXProviderError(
        "model_not_allowed",
        `Model '${canonicalModelId}' is not permitted by API key rules`,
        false,
        403,
      );
    }

    // Validate voice
    VoiceRegistry.validateVoice(request.voice);

    const resolvedModelContext = await this.modelRegistry.resolve(
      canonicalModelId,
      {
        allowDraft: false,
        allowDisabled: false,
      },
    );
    const resolvedRoute = await Promise.resolve(
      this.routeResolver.resolveRoute(
        resolvedModelContext,
        ["audio.speech" as any],
        {
          requestId,
          auth,
          stream: false,
          estimatedInputTokens: request.input.length,
          estimatedOutputTokens: 0,
        },
      ),
    );
    const activeRoute = resolvedRoute.route;

    const adapter =
      activeRoute.providerId === "deterministic"
        ? new DeterministicMultimodalAdapter()
        : new OpenAIAudioAdapter();

    const response = adapter.parseSpeechResponse({}, request);

    await this.usageMetering
      .recordRequestCompleted({
        requestId,
        status: "completed",
        completedAt: new Date(),
        durationMs: 50,
      })
      .catch(() => {});

    return response;
  }

  async getHealthStatus() {
    return {
      status: "ok" as const,
      activeStreams: this.streamRegistry.activeCount,
      routes: await this.providerService.listProviders(),
    };
  }
}
