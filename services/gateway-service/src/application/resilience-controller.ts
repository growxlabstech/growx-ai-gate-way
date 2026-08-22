import {
  GrowXProviderError,
  type CanonicalCapability,
  type NormalizedGenerationRequest,
  type NormalizedGenerationResponse,
} from "@growx/contracts";
import { createPublicId } from "@growx/ids";
import type { MachineAuthContext } from "@growx/api-key-service";
import type {
  ModelRegistryService,
  ProviderRouteEntity,
  ResolvedModelContext,
} from "@growx/model-registry-service";
import type { ProviderService } from "@growx/provider-service";
import {
  calculateBackoffDelay,
  cancellableSleep,
  classifyRetry,
  DEFAULT_RETRY_POLICY,
  InMemoryRouteHealthStore,
  type FallbackReasonCode,
  type GatewayAttemptEntity,
  type HealthOutcomeSignal,
  type IRouteHealthStore,
  type RetryPolicy,
  type RoutingDecision,
} from "@growx/routing";
import {
  QuotaEngine,
  TokenEstimator,
  InMemoryCounterStore,
  InMemoryQuotaPolicyRepository,
} from "@growx/rate-limits";
import type { PolicyEngine } from "@growx/policy";
import type { UsageMeteringService } from "@growx/metering";
import type {
  GatewayExecutionOptions,
  ResolvedGatewayRoute,
} from "../domain/types.js";
import type { IGatewayEvents } from "./events.js";
import type { IGatewayRepository } from "./repository.js";

export interface ResilienceControllerOptions {
  routeHealthStore?: IRouteHealthStore | undefined;
  quotaEngine?: QuotaEngine | undefined;
  tokenEstimator?: TokenEstimator | undefined;
  policyEngine?: PolicyEngine | undefined;
  usageMetering?: UsageMeteringService | undefined;
  retryPolicy?: Partial<RetryPolicy> | undefined;
  idGenerator?: (() => string) | undefined;
}

export interface ExecuteResilienceParams {
  requestId: string;
  request: NormalizedGenerationRequest;
  auth: MachineAuthContext;
  resolvedModel: ResolvedModelContext;
  requiredCapabilities: CanonicalCapability[];
  routingDecision?: RoutingDecision | undefined;
  resolvedRoute: ResolvedGatewayRoute;
  options: GatewayExecutionOptions;
}

export class GatewayResilienceController {
  public readonly healthStore: IRouteHealthStore;
  public readonly quotaEngine: QuotaEngine;
  public readonly tokenEstimator: TokenEstimator;
  public readonly policyEngine?: PolicyEngine | undefined;
  public readonly usageMetering?: UsageMeteringService | undefined;
  public readonly policy: RetryPolicy;
  private readonly idGenerator: () => string;

  constructor(
    private readonly modelRegistry: ModelRegistryService,
    private readonly providerService: ProviderService,
    private readonly repository: IGatewayRepository,
    private readonly events: IGatewayEvents,
    options: ResilienceControllerOptions = {},
  ) {
    this.healthStore =
      options.routeHealthStore ?? new InMemoryRouteHealthStore();
    this.quotaEngine =
      options.quotaEngine ??
      new QuotaEngine(
        new InMemoryCounterStore(),
        new InMemoryQuotaPolicyRepository(),
      );
    this.tokenEstimator = options.tokenEstimator ?? new TokenEstimator();
    this.policyEngine = options.policyEngine;
    this.usageMetering = options.usageMetering;
    this.policy = {
      ...DEFAULT_RETRY_POLICY,
      ...options.retryPolicy,
      // Hard cap to prevent dangerous retry explosion
      maxAttempts: Math.min(
        5,
        options.retryPolicy?.maxAttempts ?? DEFAULT_RETRY_POLICY.maxAttempts,
      ),
    };
    this.idGenerator = options.idGenerator ?? (() => createPublicId("attempt"));
  }

  /**
   * Revalidates whether a candidate provider route is still healthy, active,
   * credentialed, and allowed by current tenant policy.
   */
  async revalidateCandidate(
    route: ProviderRouteEntity,
    model: any,
    auth: MachineAuthContext,
    requiredCapabilities: CanonicalCapability[],
  ): Promise<boolean> {
    try {
      // 1. Check Route Status
      if (route.status !== "active" || !route.routingEligible) {
        return false;
      }

      // 2. Check Capability Overrides
      const caps =
        route.capabilitiesOverrides && route.capabilitiesOverrides.length > 0
          ? route.capabilitiesOverrides
          : model.capabilities;

      const hasAllCaps = requiredCapabilities.every((c) => caps.includes(c));
      if (!hasAllCaps) {
        return false;
      }

      // 3. Check Provider Operational Status
      const provider = await this.providerService.getProvider(route.providerId);
      if (!provider || !provider.enabled || provider.status !== "active") {
        return false;
      }

      // 4. Check Provider Credential
      const activeEnv = auth.environment || "development";
      const creds = await this.providerService.listCredentials(
        route.providerId,
      );
      const hasActiveCred = creds.some(
        (c) =>
          c.status === "active" &&
          (c.environment === activeEnv ||
            c.environment === "production" ||
            !c.environment),
      );

      if (!hasActiveCred) {
        return false;
      }

      // 5. Check Circuit Breaker State
      const health = await this.healthStore.getRouteHealth(
        route.id,
        route.providerId,
      );
      if (
        health.circuitState === "OPEN" ||
        health.circuitState === "FORCED_OPEN"
      ) {
        return false;
      }

      // 6. Check Policy Engine Route Governance
      if (this.policyEngine) {
        const policyRes = await this.policyEngine.evaluateRoutes(
          {
            organizationId: auth.organizationId,
            workspaceId: auth.workspaceId,
            apiKeyId: auth.apiKeyId,
            environment: auth.environment,
            requestedModel: model.canonicalId,
            canonicalModel: {
              id: model.id,
              canonicalId: model.canonicalId,
              family: model.family,
              category: model.category,
              inputModalities: model.inputModalities,
              outputModalities: model.outputModalities,
              contextWindow: model.contextWindow,
              maxOutputTokens: model.maxOutputTokens,
            },
          },
          [
            {
              routeId: route.id,
              providerId: route.providerId,
              providerModelId: route.providerModelId,
              region: route.region,
            },
          ],
          {
            apiKeyModelRules: auth.modelRules,
          },
        );

        if (policyRes.eligible.length === 0) {
          return false;
        }
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Executes a non-streaming generation request under the resilience engine,
   * with safe same-route retry, ranked fallback, deadline budgets, and attempt recording.
   */
  async executeNonStream(params: ExecuteResilienceParams): Promise<{
    response: NormalizedGenerationResponse;
    selectedRoute: ProviderRouteEntity;
    attempts: GatewayAttemptEntity[];
  }> {
    const {
      requestId,
      request,
      auth,
      resolvedModel,
      requiredCapabilities,
      routingDecision,
      resolvedRoute,
      options,
    } = params;

    const startedAt = Date.now();
    const timeoutMs = options.timeoutMs ?? 60_000;
    const overallDeadline = startedAt + timeoutMs;

    // 1. Build Candidate Queue from Phase 8 Routing Decision & Model Routes
    const candidateRoutes: ProviderRouteEntity[] = [];
    const allConfiguredRoutes = (resolvedModel as any)
      .eligibleConfiguredRoutes as ProviderRouteEntity[];

    // First candidate is the primary route
    candidateRoutes.push(resolvedRoute.route);

    // Followed by ranked fallback alternatives from decision
    if (
      routingDecision?.fallbackChain &&
      routingDecision.fallbackChain.length > 0
    ) {
      for (const target of routingDecision.fallbackChain) {
        const matchingRoute = allConfiguredRoutes.find(
          (r) => r.id === target.routeId,
        );
        if (
          matchingRoute &&
          !candidateRoutes.some((c) => c.id === matchingRoute.id)
        ) {
          candidateRoutes.push(matchingRoute);
        }
      }
    }

    // Add any remaining active routes as trailing candidates
    for (const r of allConfiguredRoutes) {
      if (!candidateRoutes.some((c) => c.id === r.id)) {
        candidateRoutes.push(r);
      }
    }

    let candidateIndex = 0;
    let attemptNumber = 0;
    let sameRouteRetries = 0;
    let fallbackCount = 0;
    let lastFallbackReason: FallbackReasonCode | null = null;
    let lastError: any = null;
    const attempts: GatewayAttemptEntity[] = [];

    while (attemptNumber < this.policy.maxAttempts) {
      // 2. Check Client Cancellation
      if (options.cancellationSignal?.aborted) {
        throw new GrowXProviderError(
          "request_cancelled",
          "Request was cancelled by client",
          false,
          499,
        );
      }

      // 3. Check Overall Request Deadline
      const remainingDeadlineMs = overallDeadline - Date.now();
      if (remainingDeadlineMs < this.policy.minimumRemainingDeadlineMs) {
        throw new GrowXProviderError(
          "gateway_timeout",
          `Request deadline exceeded (${timeoutMs}ms) before retry attempt could be scheduled`,
          false,
          504,
        );
      }

      // 4. Select and Revalidate Candidate Route
      let currentRoute = candidateRoutes[candidateIndex];
      if (!currentRoute) {
        break; // No more candidate routes available
      }

      const isValid = await this.revalidateCandidate(
        currentRoute,
        resolvedModel.model,
        auth,
        requiredCapabilities,
      );

      if (!isValid) {
        // Candidate is no longer valid (e.g. disabled or credential revoked) -> advance candidate
        candidateIndex++;
        continue;
      }

      // 4.5 Acquire Execution Permit from Circuit Breaker
      const permit = await this.healthStore.acquireExecutionPermit(
        currentRoute.id,
        currentRoute.providerId,
      );
      if (!permit.allowed) {
        lastFallbackReason = "PROVIDER_UNAVAILABLE";
        candidateIndex++;
        sameRouteRetries = 0;
        fallbackCount++;
        continue;
      }

      // 4.6 Acquire Provider Attempt Capacity Reservation
      const estimatedTokens = this.tokenEstimator.estimate(
        request as any,
        resolvedModel.model,
      );

      const provCapRes =
        await this.quotaEngine.evaluateAndReserveProviderAttempt({
          routeId: currentRoute.id,
          providerId: currentRoute.providerId,
          estimatedTokens,
          stream: false,
          attemptNumber: attemptNumber + 1,
          requestId,
        });

      if (!provCapRes.decision.allowed) {
        lastFallbackReason = "PROVIDER_UNAVAILABLE";
        candidateIndex++;
        sameRouteRetries = 0;
        fallbackCount++;
        continue;
      }

      const provReservation = provCapRes.reservation;

      attemptNumber++;

      // 5. Create and Persist GatewayAttempt Entity
      const attemptId = this.idGenerator();
      const attemptStarted = new Date();

      const attemptEntity: GatewayAttemptEntity = {
        id: attemptId,
        requestId,
        attemptNumber,
        routeId: currentRoute.id,
        providerId: currentRoute.providerId,
        providerModelId: currentRoute.providerModelId,
        status: "executing",
        startedAt: attemptStarted,
        completedAt: null,
        latencyMs: null,
        errorCode: null,
        retryable: false,
        fallbackReason: lastFallbackReason,
        providerRequestId: null,
        emittedClientOutput: false,
        usage: null,
        createdAt: attemptStarted,
      };

      await this.repository.createAttempt(attemptEntity).catch(() => {});
      attempts.push(attemptEntity);

      await this.usageMetering
        ?.recordAttemptStarted({
          attemptId,
          requestId,
          attemptNumber,
          providerId: currentRoute.providerId,
          providerRouteId: currentRoute.id,
          providerModelId: currentRoute.providerModelId,
          region: currentRoute.region,
          fallbackReason: lastFallbackReason ?? undefined,
        })
        .catch(() => {});

      await this.events
        .emitAttemptStarted({
          requestId,
          attemptNumber,
          routeId: currentRoute.id,
          providerId: currentRoute.providerId,
          providerModelId: currentRoute.providerModelId,
          organizationId: auth.organizationId,
          workspaceId: auth.workspaceId,
        })
        .catch(() => {});

      // 6. Setup Per-Attempt Deadline
      const attemptTimeoutMs = Math.min(timeoutMs, remainingDeadlineMs);
      const attemptAbortController = new AbortController();

      const onParentAbort = () => attemptAbortController.abort();
      options.cancellationSignal?.addEventListener("abort", onParentAbort);

      const attemptTimer = setTimeout(() => {
        attemptAbortController.abort();
      }, attemptTimeoutMs);

      try {
        const executionRoute = {
          providerId: currentRoute.providerId,
          providerModelId: currentRoute.providerModelId,
          capabilities: resolvedRoute.canonicalModel.capabilities,
          ...(currentRoute.region ? { region: currentRoute.region } : {}),
          ...(currentRoute.contextWindowOverride
            ? { contextWindow: currentRoute.contextWindowOverride }
            : {}),
          ...(currentRoute.maxOutputTokensOverride
            ? { maxOutputTokens: currentRoute.maxOutputTokensOverride }
            : {}),
        };

        // 7. Execute Provider Call
        const response = await this.providerService.executeRoute(
          executionRoute,
          {
            ...request,
            providerModelId: currentRoute.providerModelId,
          },
          {
            organizationId: auth.organizationId,
            workspaceId: auth.workspaceId,
            apiKeyId: auth.apiKeyId,
            timeoutMs: attemptTimeoutMs,
            cancellationSignal: attemptAbortController.signal,
          },
        );

        clearTimeout(attemptTimer);
        options.cancellationSignal?.removeEventListener("abort", onParentAbort);

        const latencyMs = Date.now() - attemptStarted.getTime();

        // Record positive outcome into HealthStore
        await this.healthStore
          .recordRouteOutcome({
            routeId: currentRoute.id,
            providerId: currentRoute.providerId,
            signal: "success",
            latencyMs,
            permitId: permit.permitId,
            timestamp: new Date(),
          })
          .catch(() => null);

        // Finalize provider attempt quota reservation
        if (provReservation) {
          await this.quotaEngine
            .finalizeReservation(provReservation, {
              inputTokens: response.usage.inputTokens,
              outputTokens: response.usage.outputTokens,
              totalTokens: response.usage.totalTokens,
            })
            .catch(() => {});
        }

        // 8. Attempt Succeeded
        attemptEntity.status = "succeeded";
        attemptEntity.completedAt = new Date();
        attemptEntity.latencyMs = latencyMs;
        attemptEntity.providerRequestId = response.providerRequestId ?? null;
        attemptEntity.usage = response.usage;

        await this.repository
          .updateAttempt(attemptId, {
            status: "succeeded",
            completedAt: attemptEntity.completedAt,
            latencyMs,
            providerRequestId: response.providerRequestId ?? null,
            usage: response.usage,
          })
          .catch(() => {});

        await this.usageMetering
          ?.recordAttemptCompleted({
            attemptId,
            requestId,
            completedAt: attemptEntity.completedAt,
            durationMs: latencyMs,
            ttftMs: response.timing.timeToFirstTokenMs,
            providerRequestId: response.providerRequestId,
            usage: {
              inputTokens: response.usage.inputTokens,
              outputTokens: response.usage.outputTokens,
              totalTokens: response.usage.totalTokens,
              cachedInputTokens: response.usage.cachedInputTokens,
              reasoningTokens: response.usage.reasoningTokens,
              source: response.usage.source as any,
            },
          })
          .catch(() => {});

        await this.events
          .emitAttemptSucceeded({
            requestId,
            attemptNumber,
            routeId: currentRoute.id,
            providerId: currentRoute.providerId,
            providerModelId: currentRoute.providerModelId,
            latencyMs,
            organizationId: auth.organizationId,
            workspaceId: auth.workspaceId,
          })
          .catch(() => {});

        return {
          response,
          selectedRoute: currentRoute,
          attempts,
        };
      } catch (err: any) {
        clearTimeout(attemptTimer);
        options.cancellationSignal?.removeEventListener("abort", onParentAbort);

        // Cancel provider attempt quota reservation on failure
        if (provReservation) {
          await this.quotaEngine
            .cancelReservation(provReservation)
            .catch(() => {});
        }

        const latencyMs = Date.now() - attemptStarted.getTime();
        lastError = err;

        // 9. Classify Error
        const classification = classifyRetry(err, {
          attemptNumber,
          emittedOutput: false,
        });

        // Record health outcome into HealthStore
        let signal: HealthOutcomeSignal = "error_5xx";
        if (
          options.cancellationSignal?.aborted ||
          (err instanceof GrowXProviderError &&
            err.code === "request_cancelled")
        ) {
          signal = "client_cancelled";
        } else if (classification.errorClass === "RETRYABLE_RATE_LIMIT") {
          signal = "rate_limit_429";
        } else if (classification.errorClass === "RETRYABLE_TIMEOUT") {
          signal = "timeout";
        } else if (classification.errorClass === "NON_RETRYABLE_AUTH") {
          signal = "auth_failure";
        } else if (classification.errorClass === "NON_RETRYABLE_REQUEST") {
          signal = "bad_request";
        } else if (classification.errorClass === "NON_RETRYABLE_CONTENT") {
          signal = "content_rejected";
        }

        await this.healthStore
          .recordRouteOutcome({
            routeId: currentRoute.id,
            providerId: currentRoute.providerId,
            signal,
            latencyMs,
            permitId: permit.permitId,
            timestamp: new Date(),
          })
          .catch(() => null);

        attemptEntity.status = options.cancellationSignal?.aborted
          ? "cancelled"
          : "failed";
        attemptEntity.completedAt = new Date();
        attemptEntity.latencyMs = latencyMs;
        attemptEntity.errorCode = err?.code ?? "provider_error";
        attemptEntity.retryable = classification.retryable;

        await this.repository
          .updateAttempt(attemptId, {
            status: attemptEntity.status,
            completedAt: attemptEntity.completedAt,
            latencyMs,
            errorCode: attemptEntity.errorCode,
            retryable: classification.retryable,
          })
          .catch(() => {});

        if (options.cancellationSignal?.aborted) {
          await this.usageMetering
            ?.recordAttemptCancelled({
              attemptId,
              requestId,
              completedAt: attemptEntity.completedAt,
              durationMs: latencyMs,
              usage: err?.usage
                ? {
                    inputTokens: err.usage.inputTokens,
                    outputTokens: err.usage.outputTokens,
                    totalTokens: err.usage.totalTokens,
                    source: "provider_reported",
                  }
                : undefined,
            })
            .catch(() => {});
        } else {
          await this.usageMetering
            ?.recordAttemptFailed({
              attemptId,
              requestId,
              completedAt: attemptEntity.completedAt,
              durationMs: latencyMs,
              errorCategory: classification.errorClass,
              errorCode: attemptEntity.errorCode ?? undefined,
              usage: err?.usage
                ? {
                    inputTokens: err.usage.inputTokens,
                    outputTokens: err.usage.outputTokens,
                    totalTokens: err.usage.totalTokens,
                    source: "provider_reported",
                  }
                : undefined,
            })
            .catch(() => {});
        }

        await this.events
          .emitAttemptFailed({
            requestId,
            attemptNumber,
            routeId: currentRoute.id,
            providerId: currentRoute.providerId,
            providerModelId: currentRoute.providerModelId,
            errorCode: attemptEntity.errorCode,
            latencyMs,
            organizationId: auth.organizationId,
            workspaceId: auth.workspaceId,
          })
          .catch(() => {});

        // If client cancelled, fail immediately
        if (options.cancellationSignal?.aborted) {
          throw new GrowXProviderError(
            "request_cancelled",
            "Request was cancelled by client",
            false,
            499,
          );
        }

        // If error is not retryable on this route and fallback not allowed -> fail immediately
        if (!classification.retryable && !classification.fallbackAllowed) {
          throw err;
        }

        // Check if overall attempts budget is exhausted
        if (attemptNumber >= this.policy.maxAttempts) {
          await this.events
            .emitRetryExhausted({
              requestId,
              totalAttempts: attemptNumber,
              lastError: err?.message || String(err),
              organizationId: auth.organizationId,
              workspaceId: auth.workspaceId,
            })
            .catch(() => {});
          throw err;
        }

        // 10. Decide Same-Route Retry vs Ranked Fallback
        const canRetrySameRoute =
          classification.sameRouteAllowed &&
          sameRouteRetries < this.policy.maxSameRouteRetries;

        const hasNextCandidate = candidateIndex + 1 < candidateRoutes.length;
        const canFallback =
          classification.fallbackAllowed &&
          fallbackCount < this.policy.maxFallbackRoutes &&
          hasNextCandidate &&
          this.policy.allowCrossProviderFallback;

        if (canRetrySameRoute) {
          // Same route retry
          sameRouteRetries++;
          const delayMs = calculateBackoffDelay({
            attemptNumber: sameRouteRetries,
            policy: this.policy,
            suggestedDelayMs: classification.suggestedDelayMs,
            remainingDeadlineMs: overallDeadline - Date.now(),
          });

          await this.events
            .emitRetryScheduled({
              requestId,
              attemptNumber: attemptNumber + 1,
              delayMs,
              reason: classification.reason,
              organizationId: auth.organizationId,
              workspaceId: auth.workspaceId,
            })
            .catch(() => {});

          await cancellableSleep(delayMs, options.cancellationSignal);
          continue; // Retry same route
        } else if (canFallback) {
          // Fallback to next candidate
          const fromRoute = currentRoute;
          candidateIndex++;
          const nextRoute = candidateRoutes[candidateIndex]!;
          fallbackCount++;
          sameRouteRetries = 0;
          lastFallbackReason = classification.reason;

          await this.events
            .emitFallbackSelected({
              requestId,
              fromProviderId: fromRoute.providerId,
              toProviderId: nextRoute.providerId,
              fromRouteId: fromRoute.id,
              toRouteId: nextRoute.id,
              reason: classification.reason,
              organizationId: auth.organizationId,
              workspaceId: auth.workspaceId,
            })
            .catch(() => {});

          const delayMs = calculateBackoffDelay({
            attemptNumber: 1,
            policy: this.policy,
            suggestedDelayMs: 0,
            remainingDeadlineMs: overallDeadline - Date.now(),
          });

          if (delayMs > 0) {
            await cancellableSleep(delayMs, options.cancellationSignal);
          }
          continue; // Try next candidate route
        } else {
          // Exhausted or denied
          await this.events
            .emitRetryExhausted({
              requestId,
              totalAttempts: attemptNumber,
              lastError: err?.message || String(err),
              organizationId: auth.organizationId,
              workspaceId: auth.workspaceId,
            })
            .catch(() => {});
          throw err;
        }
      }
    }

    // If loop finished without success
    if (lastError) {
      throw lastError;
    }

    throw new GrowXProviderError(
      "model_unavailable",
      "All candidate routes exhausted without successful execution",
      false,
      503,
    );
  }
}
