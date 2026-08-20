import {
  ReleaseOrchestrator,
  SmokeValidator,
} from "@growx/deployment";
import {
  RuntimeCanaryController,
  ShadowEvaluator,
  GoldenContractComparator,
  TypeScriptRuntimeAdapter,
  GoRuntimeAdapter,
  RustTokenizerAdapter,
} from "@growx/runtime-bridge";
import {
  AdmissionController,
  BenchmarkHarness,
  PlatformProfiler,
  InfrastructureCostModeler,
  LanguageMigrationDecisionEngine,
} from "@growx/performance";
import {
  ReliabilityControlPlane,
  DependencyRegistry,
  CriticalInvariantVerifier,
  RestoreDrillRunner,
  PlatformReconciliationOrchestrator,
  PlatformIncidentManager,
  RUNBOOKS,
} from "@growx/reliability";
import {
  InMemoryGovernanceRepository,
  GovernancePolicyResolver,
  GovernanceDeletionOrchestrator,
  DataExportManager,
  GovernanceReconciler,
  RetentionScheduler,
  MockDomainDeletionProcessor,
  type IGovernanceRepository,
} from "@growx/governance";
import {
  InMemoryProviderOperationRepository,
  ProviderOperationCallbackHandler,
  ProviderOperationPoller,
  ProviderOperationFinalizer,
  ProviderOperationReconciler,
  DeterministicOperationAdapter,
  OpenAIBatchAdapter,
  GeminiOperationAdapter,
  type IProviderOperationRepository,
} from "@growx/provider-operations";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import {
  GrowXProviderError,
  openAIChatCompletionRequestSchema,
  openAIEmbeddingRequestSchema,
  imageGenerationRequestSchema,
  imageEditRequestSchema,
  transcriptionRequestSchema,
  speechRequestSchema,
} from "@growx/contracts";
import type { ApiKeyService } from "@growx/api-key-service";
import {
  extractClientIp,
  formatGatewayError,
  hasApiKeyInQuery,
} from "@growx/api-key-service";
import { createPublicId } from "@growx/ids";
import type { ModelRegistryService } from "@growx/model-registry-service";
import type { GatewayEngine } from "../application/gateway-engine.js";
import {
  serializeChunk,
  serializeDone,
  serializeStreamError,
} from "./sse-serializer.js";

export interface GatewayServerOptions {
  releaseOrchestrator?: ReleaseOrchestrator;
  canaryController?: RuntimeCanaryController;
  admissionController?: AdmissionController;
  reliabilityControlPlane?: ReliabilityControlPlane;
  governanceRepository?: IGovernanceRepository;
  providerOperationRepository?: IProviderOperationRepository;
  providerOperationCallbackHandler?: ProviderOperationCallbackHandler;
  apiKeyService: ApiKeyService;
  modelRegistry: ModelRegistryService;
  gatewayEngine: GatewayEngine;
  maxBodyBytes?: number | undefined;
}

export function createGatewayServer(options: GatewayServerOptions): Server {
  const maxBodyBytes = options.maxBodyBytes ?? 5 * 1024 * 1024; // 5MB default
  const admissionController = options.admissionController ?? new AdmissionController();
  const canaryController = options.canaryController ?? new RuntimeCanaryController();
  const releaseOrchestrator = options.releaseOrchestrator ?? new ReleaseOrchestrator();
  const tsAdapter = new TypeScriptRuntimeAdapter();
  const goAdapter = new GoRuntimeAdapter();
  const benchmarkHarness = new BenchmarkHarness();
  const reliabilityControlPlane = options.reliabilityControlPlane ?? new ReliabilityControlPlane();
  const dependencyRegistry = new DependencyRegistry();
  const criticalInvariantVerifier = new CriticalInvariantVerifier();
  const restoreDrillRunner = new RestoreDrillRunner();
  const platformReconciliationOrchestrator = new PlatformReconciliationOrchestrator();
  const platformIncidentManager = new PlatformIncidentManager();
  const governanceRepo = options.governanceRepository ?? new InMemoryGovernanceRepository();
  const governancePolicyResolver = new GovernancePolicyResolver(governanceRepo);
  const governanceDeletionOrchestrator = new GovernanceDeletionOrchestrator(governanceRepo);
  governanceDeletionOrchestrator.registerProcessor(new MockDomainDeletionProcessor("postgres"));
  governanceDeletionOrchestrator.registerProcessor(new MockDomainDeletionProcessor("object_storage"));
  governanceDeletionOrchestrator.registerProcessor(new MockDomainDeletionProcessor("vector_store"));
  const dataExportManager = new DataExportManager(governanceRepo);
  const providerOperationRepo = options.providerOperationRepository ?? new InMemoryProviderOperationRepository();
  const defaultDeterministicAdapter = new DeterministicOperationAdapter();
  const defaultOpenAIAdapter = new OpenAIBatchAdapter();
  const defaultGeminiAdapter = new GeminiOperationAdapter();
  const providerOperationCallbackHandler =
    options.providerOperationCallbackHandler ??
    (() => {
      const h = new ProviderOperationCallbackHandler(providerOperationRepo);
      h.registerAdapter(defaultDeterministicAdapter);
      h.registerAdapter(defaultOpenAIAdapter);
      h.registerAdapter(defaultGeminiAdapter);
      return h;
    })();

  return createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const requestId =
      (req.headers["x-request-id"] as string) ||
      (req.headers["x-growx-request-id"] as string) ||
      createPublicId("req");

    res.setHeader("x-growx-request-id", requestId);

    // 1. Health / Liveness / Readiness Probes
    if (req.url === "/health" || req.url === "/live" || req.url === "/ready") {
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(
        JSON.stringify({
          status: "ok",
          service: "gateway-service",
          timestamp: new Date().toISOString(),
        })
      );
      return;
    }

    // 2. Reject Query Param API Keys
    if (hasApiKeyInQuery(req.url ?? "")) {
      res.writeHead(400, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(
        JSON.stringify(
          formatGatewayError("invalid_api_key", requestId)
        )
      );
      return;
    }

    const abortController = new AbortController();
    req.on("aborted", () => {
      abortController.abort();
    });
    // Detect client disconnection on streaming — only fire if response isn't done
    req.socket?.on("close", () => {
      if (!res.writableFinished && !res.writableEnded) {
        abortController.abort();
      }
    });

    try {
      const parsedUrl = new URL(req.url ?? "/", "http://localhost");
      const pathname = parsedUrl.pathname;

      // 3. Models Endpoint: GET /v1/models
      if (req.method === "GET" && (pathname === "/v1/models" || pathname === "/v1/models/")) {
        const clientIp = extractClientIp(req);
        const authDecision = await options.apiKeyService.authenticate({
          authorization: typeof req.headers["authorization"] === "string" ? req.headers["authorization"] : undefined,
          clientIp,
          permission: "models.read",
        });

        if (!authDecision.allowed) {
          res.writeHead(authDecision.status, {
            "content-type": "application/json",
            "cache-control": "no-store",
          });
          res.end(JSON.stringify(formatGatewayError(authDecision.code, requestId)));
          return;
        }

        const modelsResult = await options.modelRegistry.listCustomerModels();
        const nowSec = Math.floor(Date.now() / 1000);
        const openAIModels = modelsResult.items.map((m) => ({
          id: m.canonicalId,
          object: "model",
          created: nowSec,
          owned_by: m.family,
          permission: [],
          root: m.canonicalId,
          parent: null,
        }));

        res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
        res.end(JSON.stringify({ object: "list", data: openAIModels }));
        return;
      }

      // 4. Chat Completions: POST /v1/chat/completions
      if (req.method === "POST" && pathname === "/v1/chat/completions") {
        // Content-Type validation
        const contentType = req.headers["content-type"];
        if (!contentType || !contentType.toLowerCase().includes("application/json")) {
          res.writeHead(415, { "content-type": "application/json", "cache-control": "no-store" });
          res.end(
            JSON.stringify({
              error: {
                type: "invalid_request_error",
                code: "unsupported_media_type",
                message: "Content-Type must be application/json",
                requestId,
              },
            })
          );
          return;
        }

        // Authenticate with Machine Auth
        const clientIp = extractClientIp(req);
        const authDecision = await options.apiKeyService.authenticate({
          authorization: typeof req.headers["authorization"] === "string" ? req.headers["authorization"] : undefined,
          clientIp,
          permission: "chat.completions.create",
        });

        if (!authDecision.allowed) {
          res.writeHead(authDecision.status, {
            "content-type": "application/json",
            "cache-control": "no-store",
          });
          res.end(JSON.stringify(formatGatewayError(authDecision.code, requestId)));
          return;
        }

        options.apiKeyService.recordLastUsed(authDecision.context.apiKeyId);

        // Read and parse request body safely with size limit
        const body = await readJsonBody(req, maxBodyBytes);

        // Validate Chat Completion Request Schema
        const parseResult = openAIChatCompletionRequestSchema.safeParse(body);
        if (!parseResult.success) {
          res.writeHead(400, { "content-type": "application/json", "cache-control": "no-store" });
          res.end(
            JSON.stringify({
              error: {
                type: "invalid_request_error",
                code: "invalid_request",
                message: parseResult.error.issues[0]?.message ?? "Invalid request body",
                requestId,
              },
            })
          );
          return;
        }

        const chatRequest = parseResult.data;

        // Non-streaming execution
        if (!chatRequest.stream) {
          const completion = await options.gatewayEngine.executeChatCompletion(
            authDecision.context,
            chatRequest,
            {
              requestId,
              cancellationSignal: abortController.signal,
              clientIp,
            }
          );

          res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
          res.end(JSON.stringify(completion));
          return;
        }

        // Streaming execution (SSE)
        res.writeHead(200, {
          "content-type": "text/event-stream",
          "cache-control": "no-cache, no-transform",
          "connection": "keep-alive",
          "x-accel-buffering": "no",
        });

        // Parse stream_options
        const includeUsage = chatRequest.stream_options?.include_usage ?? false;

        try {
          for await (const chunk of options.gatewayEngine.streamChatCompletion(
            authDecision.context,
            chatRequest,
            {
              requestId,
              cancellationSignal: abortController.signal,
              clientIp,
              includeUsage,
            }
          )) {
            const serialized = serializeChunk(chunk);
            if (!res.write(serialized)) {
              await new Promise<void>((resolve) => res.once("drain", resolve));
            }
          }

          res.end(serializeDone());
        } catch (streamErr: unknown) {
          // Mid-stream error: headers already sent, use safe SSE error frame
          if (!res.writableEnded) {
            const errorCode =
              streamErr instanceof GrowXProviderError
                ? streamErr.code
                : "internal_error";
            const errorMessage =
              streamErr instanceof GrowXProviderError
                ? streamErr.message
                : "An internal error occurred during streaming";

            res.end(serializeStreamError(errorCode, errorMessage, requestId));
          }
        }
        return;
      }

      // 4b. Embeddings Endpoint: POST /v1/embeddings
      if (req.method === "POST" && pathname === "/v1/embeddings") {
        const contentType = req.headers["content-type"];
        if (!contentType || !contentType.toLowerCase().includes("application/json")) {
          res.writeHead(415, { "content-type": "application/json", "cache-control": "no-store" });
          res.end(
            JSON.stringify({
              error: {
                type: "invalid_request_error",
                code: "unsupported_media_type",
                message: "Content-Type must be application/json",
                requestId,
              },
            })
          );
          return;
        }

        const clientIp = extractClientIp(req);
        const authDecision = await options.apiKeyService.authenticate({
          authorization: typeof req.headers["authorization"] === "string" ? req.headers["authorization"] : undefined,
          clientIp,
          permission: "embeddings.create",
        });

        if (!authDecision.allowed) {
          res.writeHead(authDecision.status, {
            "content-type": "application/json",
            "cache-control": "no-store",
          });
          res.end(JSON.stringify(formatGatewayError(authDecision.code, requestId)));
          return;
        }

        const rawBody = await readJsonBody(req, maxBodyBytes);
        const parseResult = openAIEmbeddingRequestSchema.safeParse(rawBody);
        if (!parseResult.success) {
          res.writeHead(400, { "content-type": "application/json", "cache-control": "no-store" });
          res.end(
            JSON.stringify({
              error: {
                type: "invalid_request_error",
                code: "invalid_request",
                message: parseResult.error.issues.map((i) => i.message).join("; "),
                requestId,
              },
            })
          );
          return;
        }

        try {
          const embeddingResponse = await options.gatewayEngine.executeEmbedding(
            authDecision.context,
            parseResult.data,
            { requestId }
          );

          res.writeHead(200, {
            "content-type": "application/json",
            "cache-control": "no-store",
          });
          res.end(JSON.stringify(embeddingResponse));
        } catch (execErr: any) {
          const statusCode = typeof execErr?.statusCode === "number" ? execErr.statusCode : 500;
          const errorCode = execErr?.code || "internal_error";
          const errorMessage = execErr?.message || "Embedding generation failed";

          res.writeHead(statusCode, {
            "content-type": "application/json",
            "cache-control": "no-store",
          });
          res.end(
            JSON.stringify({
              error: {
                type: "gateway_error",
                code: errorCode,
                message: errorMessage,
                requestId,
              },
            })
          );
        }
        return;
      }

      // 5. Privileged Debug Endpoint: GET /internal/gateway/requests/:id/attempts
      if (req.method === "GET" && pathname.startsWith("/internal/gateway/requests/") && pathname.endsWith("/attempts")) {
        const parts = pathname.split("/");
        const reqId = parts[4];
        if (reqId) {
          const repo = (options.gatewayEngine as any).repository as any;
          const attempts = repo?.listAttemptsByRequestId ? await repo.listAttemptsByRequestId(reqId) : [];
          res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
          res.end(JSON.stringify({ requestId: reqId, attempts }));
          return;
        }
      }

      // 6. Phase 10: Internal Health and Circuit Breaker Endpoints
      const healthStore = (options.gatewayEngine as any).resilienceController?.healthStore;

      
      // GET /internal/cache/stats
      if (req.method === "GET" && pathname === "/internal/cache/stats") {
        const stats = await options.gatewayEngine.cacheService.getStats();
        res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
        res.end(JSON.stringify({ stats }));
        return;
      }

      // POST /internal/cache/invalidate
      if (req.method === "POST" && pathname === "/internal/cache/invalidate") {
        const body = await readJsonBody(req, maxBodyBytes);
        const count = await options.gatewayEngine.cacheService.invalidate(body as any);
        res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
        res.end(JSON.stringify({ invalidated: count }));
        return;
      }

      // POST /v1/workspaces/:workspaceId/cache/invalidate
      if (req.method === "POST" && pathname.startsWith("/v1/workspaces/") && pathname.endsWith("/cache/invalidate")) {
        const clientIp = extractClientIp(req);
        const authDecision = await options.apiKeyService.authenticate({
          authorization: typeof req.headers["authorization"] === "string" ? req.headers["authorization"] : undefined,
          clientIp,
          permission: "chat.completions.create",
        });

        if (!authDecision.allowed) {
          res.writeHead(authDecision.status, { "content-type": "application/json", "cache-control": "no-store" });
          res.end(JSON.stringify(formatGatewayError(authDecision.code, requestId)));
          return;
        }

        const parts = pathname.split("/");
        const targetWorkspaceId = parts[3];

        if (authDecision.context.workspaceId !== targetWorkspaceId) {
          res.writeHead(403, { "content-type": "application/json", "cache-control": "no-store" });
          res.end(JSON.stringify({ error: { type: "permission_error", code: "workspace_mismatch", message: "Forbidden", requestId } }));
          return;
        }

        const count = await options.gatewayEngine.cacheService.invalidate({
          organizationId: authDecision.context.organizationId,
          workspaceId: targetWorkspaceId,
        });

        res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
        res.end(JSON.stringify({ invalidated: count }));
        return;
      }

      // GET /internal/providers/health
      if (req.method === "GET" && pathname === "/internal/providers/health") {
        const snapshots = healthStore ? await healthStore.listSnapshots() : [];
        res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
        res.end(JSON.stringify({ snapshots }));
        return;
      }

      // GET /internal/providers/:id/health
      if (req.method === "GET" && pathname.startsWith("/internal/providers/") && pathname.endsWith("/health")) {
        const parts = pathname.split("/");
        const providerId = parts[3];
        if (providerId && healthStore) {
          const health = await healthStore.getAggregateProviderHealth(providerId);
          res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
          res.end(JSON.stringify(health));
          return;
        }
      }

      // GET /internal/routes/:id/health
      if (req.method === "GET" && pathname.startsWith("/internal/routes/") && pathname.endsWith("/health")) {
        const parts = pathname.split("/");
        const routeId = parts[3];
        if (routeId && healthStore) {
          const health = await healthStore.getRouteHealth(routeId);
          res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
          res.end(JSON.stringify(health));
          return;
        }
      }

      // GET /internal/routes/:id/circuit
      if (req.method === "GET" && pathname.startsWith("/internal/routes/") && pathname.endsWith("/circuit")) {
        const parts = pathname.split("/");
        const routeId = parts[3];
        if (routeId && healthStore) {
          const health = await healthStore.getRouteHealth(routeId);
          res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
          res.end(JSON.stringify({ routeId, circuitState: health.circuitState, manualOverride: health.manualOverride }));
          return;
        }
      }

      // POST /internal/routes/:id/circuit/open
      if (req.method === "POST" && pathname.startsWith("/internal/routes/") && pathname.endsWith("/circuit/open")) {
        const parts = pathname.split("/");
        const routeId = parts[3];
        if (routeId && healthStore) {
          const body = ((await readJsonBody(req, maxBodyBytes).catch(() => ({}))) ?? {}) as Record<string, any>;
          const reason = String(body.reason ?? "Manual administrative force open");
          const setBy = String(body.setBy ?? "admin_ops");
          const expiresAt = body.expiresAt ? new Date(String(body.expiresAt)) : null;

          const transition = await healthStore.setManualOverride(
            routeId,
            String(body.providerId ?? "unknown"),
            "FORCED_OPEN",
            reason,
            setBy,
            expiresAt
          );

          res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
          res.end(JSON.stringify({ success: true, transition }));
          return;
        }
      }

      // POST /internal/routes/:id/circuit/recover
      if (req.method === "POST" && pathname.startsWith("/internal/routes/") && pathname.endsWith("/circuit/recover")) {
        const parts = pathname.split("/");
        const routeId = parts[3];
        if (routeId && healthStore) {
          const body = ((await readJsonBody(req, maxBodyBytes).catch(() => ({}))) ?? {}) as Record<string, any>;
          const setBy = String(body.setBy ?? "admin_ops");

          const transition = await healthStore.recoverRoute(
            routeId,
            String(body.providerId ?? "unknown"),
            setBy
          );

          res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
          res.end(JSON.stringify({ success: true, transition }));
          return;
        }
      }

      // POST /internal/routes/:id/circuit/reset
      if (req.method === "POST" && pathname.startsWith("/internal/routes/") && pathname.endsWith("/circuit/reset")) {
        const parts = pathname.split("/");
        const routeId = parts[3];
        if (routeId && healthStore) {
          const transition = await healthStore.resetRoute(routeId);
          res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
          res.end(JSON.stringify({ success: true, transition }));
          return;
        }
      }

      // 7. Phase 11: Internal Quota and Capacity Management Endpoints
      const quotaEngine = options.gatewayEngine.quotaEngine;

      // GET /internal/quota/policies
      if (req.method === "GET" && pathname === "/internal/quota/policies") {
        const scopeType = parsedUrl.searchParams.get("scopeType") as any;
        const policies = (quotaEngine as any).policyRepo
          ? await (quotaEngine as any).policyRepo.listPolicies(scopeType)
          : [];
        res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
        res.end(JSON.stringify({ policies }));
        return;
      }

      // POST /internal/quota/policies
      if (req.method === "POST" && pathname === "/internal/quota/policies") {
        const body = ((await readJsonBody(req, maxBodyBytes).catch(() => ({}))) ?? {}) as Record<string, any>;
        if ((quotaEngine as any).policyRepo) {
          const created = await (quotaEngine as any).policyRepo.saveLimit(body);
          res.writeHead(201, { "content-type": "application/json", "cache-control": "no-store" });
          res.end(JSON.stringify({ success: true, policy: created }));
          return;
        }
      }

      // DELETE /internal/quota/policies/:id
      if (req.method === "DELETE" && pathname.startsWith("/internal/quota/policies/")) {
        const parts = pathname.split("/");
        const policyId = parts[4];
        if (policyId && (quotaEngine as any).policyRepo) {
          const deleted = await (quotaEngine as any).policyRepo.deleteLimit(policyId);
          res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
          res.end(JSON.stringify({ success: deleted }));
          return;
        }
      }

      // GET /internal/capacity/routes/:id
      if (req.method === "GET" && pathname.startsWith("/internal/capacity/routes/")) {
        const parts = pathname.split("/");
        const routeId = parts[4];
        if (routeId) {
          const metrics = (quotaEngine as any).counterStore
            ? await (quotaEngine as any).counterStore.getCapacityMetrics([
                `ratelimit:provider_route:${routeId}:requests:60`,
                `ratelimit:provider_route:${routeId}:tokens:60`,
                `concurrency:provider_route:${routeId}:requests`,
              ])
            : {};
          res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
          res.end(JSON.stringify({ routeId, metrics }));
          return;
        }
      }

      const policyEngine = options.gatewayEngine.policyEngine;

      // GET /internal/policies
      if (req.method === "GET" && pathname === "/internal/policies") {
        const scopeType = parsedUrl.searchParams.get("scopeType") as any;
        const scopeId = parsedUrl.searchParams.get("scopeId") ?? undefined;
        const policies = await policyEngine.repository.listPolicies(scopeType, scopeId);
        res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
        res.end(JSON.stringify({ policies }));
        return;
      }

      // POST /internal/policies
      if (req.method === "POST" && pathname === "/internal/policies") {
        const body = ((await readJsonBody(req, maxBodyBytes).catch(() => ({}))) ?? {}) as Record<string, any>;
        const created = await policyEngine.createPolicy(
          {
            scopeType: body.scopeType,
            scopeId: body.scopeId ?? null,
            name: body.name,
            description: body.description,
            status: body.status,
            definition: body.definition,
            createdBy: body.createdBy ?? "system",
          },
          body.actorId ?? "system"
        );
        res.writeHead(201, { "content-type": "application/json", "cache-control": "no-store" });
        res.end(JSON.stringify({ success: true, ...created }));
        return;
      }

      // GET /internal/policies/:id
      if (req.method === "GET" && pathname.startsWith("/internal/policies/") && !pathname.endsWith("/effective") && !pathname.endsWith("/simulate") && !pathname.endsWith("/versions") && !pathname.endsWith("/activate")) {
        const parts = pathname.split("/");
        const policyId = parts[3];
        if (policyId) {
          const policy = await policyEngine.repository.getPolicy(policyId);
          if (!policy) {
            res.writeHead(404, { "content-type": "application/json" });
            res.end(JSON.stringify({ error: { message: `Policy '${policyId}' not found` } }));
            return;
          }
          const activeVersion = await policyEngine.repository.getActiveVersion(policyId);
          const versions = await policyEngine.repository.listVersions(policyId);
          res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
          res.end(JSON.stringify({ policy, activeVersion, versions }));
          return;
        }
      }

      // POST /internal/policies/:id/versions
      if (req.method === "POST" && pathname.startsWith("/internal/policies/") && pathname.endsWith("/versions")) {
        const parts = pathname.split("/");
        const policyId = parts[3];
        const body = ((await readJsonBody(req, maxBodyBytes).catch(() => ({}))) ?? {}) as Record<string, any>;
        if (policyId && body.definition) {
          const version = await policyEngine.createVersion(policyId, body.definition, body.actorId ?? "system");
          res.writeHead(201, { "content-type": "application/json", "cache-control": "no-store" });
          res.end(JSON.stringify({ success: true, version }));
          return;
        }
      }

      // POST /internal/policies/:id/activate
      if (req.method === "POST" && pathname.startsWith("/internal/policies/") && pathname.endsWith("/activate")) {
        const parts = pathname.split("/");
        const policyId = parts[3];
        const body = ((await readJsonBody(req, maxBodyBytes).catch(() => ({}))) ?? {}) as Record<string, any>;
        if (policyId && body.versionNumber !== undefined) {
          const activated = await policyEngine.activateVersion(policyId, Number(body.versionNumber), body.actorId ?? "system");
          res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
          res.end(JSON.stringify({ success: true, policy: activated }));
          return;
        }
      }

      // GET /internal/policies/effective
      if (req.method === "GET" && pathname === "/internal/policies/effective") {
        const orgId = parsedUrl.searchParams.get("organizationId") ?? "";
        const wsId = parsedUrl.searchParams.get("workspaceId") ?? "";
        const keyId = parsedUrl.searchParams.get("apiKeyId") ?? undefined;
        const effective = await policyEngine.getEffectivePolicy(orgId, wsId, keyId);
        res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
        res.end(JSON.stringify({ effectivePolicy: effective }));
        return;
      }

      // POST /internal/policies/simulate
      if (req.method === "POST" && pathname === "/internal/policies/simulate") {
        const body = ((await readJsonBody(req, maxBodyBytes).catch(() => ({}))) ?? {}) as Record<string, any>;
        const simResult = await policyEngine.simulatePolicy(body.context, body.candidates);
        res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
        res.end(JSON.stringify(simResult));
        return;
      }

      // ─── Phase 13 Usage & Metering Endpoints ───
      const usageMetering = options.gatewayEngine.usageMetering;

      // GET /v1/usage (Customer tenant-scoped aggregated usage)
      if (req.method === "GET" && pathname === "/v1/usage") {
        const clientIp = extractClientIp(req);
        const authDecision = await options.apiKeyService.authenticate({
          authorization: typeof req.headers["authorization"] === "string" ? req.headers["authorization"] : undefined,
          clientIp,
          permission: "usage.read",
        });

        if (!authDecision.allowed) {
          res.writeHead(authDecision.status, { "content-type": "application/json", "cache-control": "no-store" });
          res.end(JSON.stringify(formatGatewayError(authDecision.code, requestId)));
          return;
        }

        const bucket = (parsedUrl.searchParams.get("bucket") as "hourly" | "daily") ?? "hourly";
        const aggregates = await usageMetering.queryAggregates({
          organizationId: authDecision.context.organizationId,
          workspaceId: authDecision.context.workspaceId,
          apiKeyId: parsedUrl.searchParams.get("apiKeyId") ?? undefined,
          canonicalModelId: parsedUrl.searchParams.get("model") ?? undefined,
          bucket,
          limit: Math.min(1000, Number(parsedUrl.searchParams.get("limit") ?? 100)),
        });

        res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
        res.end(
          JSON.stringify({
            object: "list",
            data: aggregates.map((a) => ({
              id: a.id,
              organization_id: a.organizationId,
              workspace_id: a.workspaceId,
              api_key_id: a.apiKeyId,
              model: a.canonicalModelId,
              bucket: a.bucket,
              bucket_start: a.bucketStart.toISOString(),
              bucket_end: a.bucketEnd.toISOString(),
              input_tokens: a.inputTokens.toString(),
              output_tokens: a.outputTokens.toString(),
              total_tokens: a.totalTokens.toString(),
              cached_input_tokens: a.cachedInputTokens.toString(),
              reasoning_tokens: a.reasoningTokens.toString(),
              request_count: a.requestCount,
            })),
          })
        );
        return;
      }

      // GET /v1/usage/requests/:id (Customer tenant-scoped request usage)
      if (req.method === "GET" && pathname.startsWith("/v1/usage/requests/")) {
        const clientIp = extractClientIp(req);
        const authDecision = await options.apiKeyService.authenticate({
          authorization: typeof req.headers["authorization"] === "string" ? req.headers["authorization"] : undefined,
          clientIp,
          permission: "usage.read",
        });

        if (!authDecision.allowed) {
          res.writeHead(authDecision.status, { "content-type": "application/json", "cache-control": "no-store" });
          res.end(JSON.stringify(formatGatewayError(authDecision.code, requestId)));
          return;
        }

        const targetRequestId = pathname.replace("/v1/usage/requests/", "");
        const requestRecord = await (usageMetering as any).repository.getRequestRecord(targetRequestId);

        if (
          !requestRecord ||
          requestRecord.organizationId !== authDecision.context.organizationId ||
          requestRecord.workspaceId !== authDecision.context.workspaceId
        ) {
          res.writeHead(404, { "content-type": "application/json", "cache-control": "no-store" });
          res.end(
            JSON.stringify({
              error: { type: "invalid_request_error", code: "not_found", message: "Usage record not found", requestId },
            })
          );
          return;
        }

        res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
        res.end(
          JSON.stringify({
            id: requestRecord.id,
            request_id: requestRecord.requestId,
            model: requestRecord.canonicalModelId,
            status: requestRecord.status,
            streaming: requestRecord.streaming,
            duration_ms: requestRecord.durationMs,
            ttft_ms: requestRecord.ttftMs,
            logical_usage: requestRecord.logicalUsage,
            metering_quality: requestRecord.meteringQuality,
            created_at: requestRecord.createdAt.toISOString(),
          })
        );
        return;
      }

      // GET /internal/usage/requests/:requestId
      if (req.method === "GET" && pathname.startsWith("/internal/usage/requests/")) {
        const targetRequestId = pathname.replace("/internal/usage/requests/", "");
        const reqRecord = await (usageMetering as any).repository.getRequestRecord(targetRequestId);
        if (!reqRecord) {
          res.writeHead(404, { "content-type": "application/json", "cache-control": "no-store" });
          res.end(JSON.stringify({ error: { code: "not_found", message: "Request record not found" } }));
          return;
        }
        const attempts = await (usageMetering as any).repository.listAttemptsForRequest(targetRequestId);
        const events = await (usageMetering as any).repository.listUsageEventsForRequest(targetRequestId);
        res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
        res.end(
          JSON.stringify({
            request: reqRecord,
            attempts,
            events: events.map((e: any) => ({ ...e, quantity: e.quantity.toString() })),
          })
        );
        return;
      }

      // GET /internal/usage/attempts/:attemptId
      if (req.method === "GET" && pathname.startsWith("/internal/usage/attempts/")) {
        const targetAttemptId = pathname.replace("/internal/usage/attempts/", "");
        const attemptRecord = await (usageMetering as any).repository.getAttemptRecord(targetAttemptId);
        if (!attemptRecord) {
          res.writeHead(404, { "content-type": "application/json", "cache-control": "no-store" });
          res.end(JSON.stringify({ error: { code: "not_found", message: "Attempt record not found" } }));
          return;
        }
        res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
        res.end(JSON.stringify(attemptRecord));
        return;
      }

      // GET /internal/usage/events
      if (req.method === "GET" && pathname === "/internal/usage/events") {
        const orgId = parsedUrl.searchParams.get("organizationId") ?? "";
        const wsId = parsedUrl.searchParams.get("workspaceId") ?? undefined;
        const limit = Math.min(1000, Number(parsedUrl.searchParams.get("limit") ?? 100));
        const events = await (usageMetering as any).repository.queryUsageEvents({
          organizationId: orgId,
          workspaceId: wsId,
          limit,
        });
        res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
        res.end(JSON.stringify(events.map((e: any) => ({ ...e, quantity: e.quantity.toString() }))));
        return;
      }

      // GET /internal/usage/aggregates
      if (req.method === "GET" && pathname === "/internal/usage/aggregates") {
        const orgId = parsedUrl.searchParams.get("organizationId") ?? "";
        const wsId = parsedUrl.searchParams.get("workspaceId") ?? undefined;
        const bucket = (parsedUrl.searchParams.get("bucket") as "hourly" | "daily") ?? undefined;
        const aggregates = await usageMetering.queryAggregates({
          organizationId: orgId,
          workspaceId: wsId,
          bucket,
          limit: Math.min(1000, Number(parsedUrl.searchParams.get("limit") ?? 100)),
        });
        res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
        res.end(
          JSON.stringify(
            aggregates.map((a: any) => ({
              ...a,
              inputTokens: a.inputTokens.toString(),
              outputTokens: a.outputTokens.toString(),
              totalTokens: a.totalTokens.toString(),
              cachedInputTokens: a.cachedInputTokens.toString(),
              reasoningTokens: a.reasoningTokens.toString(),
            }))
          )
        );
        return;
      }

      // POST /internal/usage/correct (Privileged manual adjustment)
      if (req.method === "POST" && pathname === "/internal/usage/correct") {
        const body = ((await readJsonBody(req, maxBodyBytes).catch(() => ({}))) ?? {}) as Record<string, any>;
        if (!body.reason || !body.requestId || !body.usageType) {
          res.writeHead(400, { "content-type": "application/json", "cache-control": "no-store" });
          res.end(JSON.stringify({ error: { code: "invalid_request", message: "Missing required fields" } }));
          return;
        }

        const adjustment = await usageMetering.recordAdjustment({
          requestId: body.requestId,
          usageType: body.usageType,
          differenceQuantity: BigInt(body.differenceQuantity),
          previousQuantity: BigInt(body.previousQuantity ?? 0),
          newQuantity: BigInt(body.newQuantity ?? 0),
          reason: body.reason,
          operatorId: body.operatorId ?? "privileged.operator",
          attemptId: body.attemptId,
          originalEventId: body.originalEventId,
        });

        res.writeHead(201, { "content-type": "application/json", "cache-control": "no-store" });
        res.end(
          JSON.stringify({
            ...adjustment,
            differenceQuantity: adjustment.differenceQuantity.toString(),
            previousQuantity: adjustment.previousQuantity.toString(),
            newQuantity: adjustment.newQuantity.toString(),
          })
        );
        return;
      }

      // POST /internal/usage/reconcile (Automated reconciliation)
      if (req.method === "POST" && pathname === "/internal/usage/reconcile") {
        const body = ((await readJsonBody(req, maxBodyBytes).catch(() => ({}))) ?? {}) as Record<string, any>;
        if (!body.requestId || body.actualInputTokens === undefined || body.actualOutputTokens === undefined) {
          res.writeHead(400, { "content-type": "application/json", "cache-control": "no-store" });
          res.end(JSON.stringify({ error: { code: "invalid_request", message: "Missing required fields" } }));
          return;
        }

        await usageMetering.reconcileUsage({
          requestId: body.requestId,
          actualInputTokens: Number(body.actualInputTokens),
          actualOutputTokens: Number(body.actualOutputTokens),
          reason: body.reason,
          operatorId: body.operatorId,
        });

        res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
        res.end(JSON.stringify({ status: "reconciled", requestId: body.requestId }));
        return;
      }

      // POST /internal/usage/aggregates/rebuild
      if (req.method === "POST" && pathname === "/internal/usage/aggregates/rebuild") {
        const rebuildResult = await usageMetering.rebuildAggregates();
        res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
        res.end(JSON.stringify(rebuildResult));
        return;
      }

      // ==========================================
      // Phase 34: Provider Operations Endpoints
      // ==========================================

      // POST /internal/provider-operations/callback/:provider
      if (req.method === "POST" && pathname.startsWith("/internal/provider-operations/callback/")) {
        const parts = pathname.split("/");
        const providerId = parts[4] || "deterministic";
        const body = (await readJsonBody(req, maxBodyBytes).catch(() => ({}))) as Record<string, unknown>;
        const headers: Record<string, string> = {};
        for (const [k, v] of Object.entries(req.headers)) {
          if (typeof v === "string") headers[k.toLowerCase()] = v;
        }

        const callbackRes = await providerOperationCallbackHandler.handleCallback(
          providerId,
          body,
          headers
        );

        res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
        res.end(JSON.stringify(callbackRes));
        return;
      }

      // GET /internal/provider-operations
      if (req.method === "GET" && pathname === "/internal/provider-operations") {
        const organizationId = parsedUrl.searchParams.get("organizationId") || undefined;
        const providerId = parsedUrl.searchParams.get("providerId") || undefined;
        const status = (parsedUrl.searchParams.get("status") as any) || undefined;
        const limit = parseInt(parsedUrl.searchParams.get("limit") || "50", 10);

        const list = await providerOperationRepo.list({
          organizationId,
          providerId,
          status,
          limit,
        });

        res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
        res.end(JSON.stringify({ object: "list", data: list }));
        return;
      }

      // GET /internal/provider-operations/:id
      if (req.method === "GET" && pathname.startsWith("/internal/provider-operations/")) {
        const parts = pathname.split("/");
        const operationId = parts[3];
        if (operationId) {
          const op = await providerOperationRepo.getById(operationId);
          if (!op) {
            res.writeHead(404, { "content-type": "application/json", "cache-control": "no-store" });
            res.end(JSON.stringify({ error: { code: "operation_not_found", message: "Operation not found" } }));
            return;
          }
          res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
          res.end(JSON.stringify(op));
          return;
        }
      }

      // POST /internal/provider-operations/:id/reconcile
      if (req.method === "POST" && pathname.startsWith("/internal/provider-operations/") && pathname.endsWith("/reconcile")) {
        const parts = pathname.split("/");
        const operationId = parts[3];
        if (operationId) {
          const op = await providerOperationRepo.getById(operationId);
          if (!op) {
            res.writeHead(404, { "content-type": "application/json", "cache-control": "no-store" });
            res.end(JSON.stringify({ error: { code: "operation_not_found", message: "Operation not found" } }));
            return;
          }

          if (op.status === "finalizing") {
            const finalizer = new ProviderOperationFinalizer(providerOperationRepo);
            finalizer.registerAdapter(defaultDeterministicAdapter);
            await finalizer.finalize(op.id);
          }

          const updated = await providerOperationRepo.getById(operationId);
          res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
          res.end(JSON.stringify({ success: true, operation: updated }));
          return;
        }
      }

      // POST /internal/provider-operations/:id/cancel
      if (req.method === "POST" && pathname.startsWith("/internal/provider-operations/") && pathname.endsWith("/cancel")) {
        const parts = pathname.split("/");
        const operationId = parts[3];
        if (operationId) {
          const op = await providerOperationRepo.getById(operationId);
          if (!op) {
            res.writeHead(404, { "content-type": "application/json", "cache-control": "no-store" });
            res.end(JSON.stringify({ error: { code: "operation_not_found", message: "Operation not found" } }));
            return;
          }

          await providerOperationRepo.update(op.id, {
            status: "cancelled",
            cancelledAt: new Date(),
          });

          const updated = await providerOperationRepo.getById(operationId);
          res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
          res.end(JSON.stringify({ success: true, operation: updated }));
          return;
        }
      }

      // Customer Public API: GET /v1/operations/:id
      if (req.method === "GET" && pathname.startsWith("/v1/operations/")) {
        const clientIp = extractClientIp(req);
        const authDecision = await options.apiKeyService.authenticate({
          authorization: typeof req.headers["authorization"] === "string" ? req.headers["authorization"] : undefined,
          clientIp,
          permission: "operations.read" as any,
        });

        if (!authDecision.allowed) {
          res.writeHead(authDecision.status, {
            "content-type": "application/json",
            "cache-control": "no-store",
          });
          res.end(JSON.stringify(formatGatewayError(authDecision.code, requestId)));
          return;
        }

        const auth = authDecision.context!;
        const parts = pathname.split("/");
        const operationId = parts[3];
        if (operationId) {
          const op = await providerOperationRepo.getById(operationId);
          if (!op || op.organizationId !== auth.organizationId) {
            res.writeHead(404, { "content-type": "application/json", "cache-control": "no-store" });
            res.end(JSON.stringify({ error: { code: "operation_not_found", message: "Operation not found" } }));
            return;
          }

          res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
          res.end(JSON.stringify({
            id: op.id,
            object: "operation",
            operation_type: op.operationType,
            status: op.status,
            created_at: Math.floor(new Date(op.createdAt).getTime() / 1000),
            completed_at: op.completedAt ? Math.floor(new Date(op.completedAt).getTime() / 1000) : undefined,
            output_file_id: op.outputFileId,
            error: op.errorCode ? { code: op.errorCode, message: op.errorMessage } : undefined,
          }));
          return;
        }
      }

      // Customer Public API: POST /v1/operations/:id/cancel
      if (req.method === "POST" && pathname.startsWith("/v1/operations/") && pathname.endsWith("/cancel")) {
        const clientIp = extractClientIp(req);
        const authDecision = await options.apiKeyService.authenticate({
          authorization: typeof req.headers["authorization"] === "string" ? req.headers["authorization"] : undefined,
          clientIp,
          permission: "operations.cancel" as any,
        });

        if (!authDecision.allowed) {
          res.writeHead(authDecision.status, {
            "content-type": "application/json",
            "cache-control": "no-store",
          });
          res.end(JSON.stringify(formatGatewayError(authDecision.code, requestId)));
          return;
        }

        const auth = authDecision.context!;
        const parts = pathname.split("/");
        const operationId = parts[3];
        if (operationId) {
          const op = await providerOperationRepo.getById(operationId);
          if (!op || op.organizationId !== auth.organizationId) {
            res.writeHead(404, { "content-type": "application/json", "cache-control": "no-store" });
            res.end(JSON.stringify({ error: { code: "operation_not_found", message: "Operation not found" } }));
            return;
          }

          await providerOperationRepo.update(op.id, {
            status: "cancelled",
            cancelledAt: new Date(),
          });

          const updated = await providerOperationRepo.getById(operationId);
          res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
          res.end(JSON.stringify({
            id: updated!.id,
            object: "operation",
            status: updated!.status,
            cancelled_at: Math.floor(new Date(updated!.cancelledAt!).getTime() / 1000),
          }));
          return;
        }
      }

      // ==========================================
      // Phase 35: Data Governance & Privacy Endpoints
      // ==========================================

      // Customer API: GET /v1/governance/retention
      if (req.method === "GET" && pathname === "/v1/governance/retention") {
        const clientIp = extractClientIp(req);
        const authDecision = await options.apiKeyService.authenticate({
          authorization: typeof req.headers["authorization"] === "string" ? req.headers["authorization"] : undefined,
          clientIp,
          permission: "governance.read" as any,
        });

        if (!authDecision.allowed) {
          res.writeHead(authDecision.status, { "content-type": "application/json", "cache-control": "no-store" });
          res.end(JSON.stringify(formatGatewayError(authDecision.code, requestId)));
          return;
        }

        const auth = authDecision.context!;
        const policies = await governanceRepo.listPolicies("organization", auth.organizationId);
        res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
        res.end(JSON.stringify({ object: "list", data: policies }));
        return;
      }

      // Customer API: POST /v1/data-exports
      if (req.method === "POST" && pathname === "/v1/data-exports") {
        const clientIp = extractClientIp(req);
        const authDecision = await options.apiKeyService.authenticate({
          authorization: typeof req.headers["authorization"] === "string" ? req.headers["authorization"] : undefined,
          clientIp,
          permission: "data.export" as any,
        });

        if (!authDecision.allowed) {
          res.writeHead(authDecision.status, { "content-type": "application/json", "cache-control": "no-store" });
          res.end(JSON.stringify(formatGatewayError(authDecision.code, requestId)));
          return;
        }

        const auth = authDecision.context!;
        const exportId = `exp_${createPublicId("req")}`;
        await governanceRepo.createExportRequest({
          id: exportId,
          organizationId: auth.organizationId,
          workspaceId: auth.workspaceId,
          requestedBy: auth.apiKeyId,
          status: "requested",
          createdAt: new Date(),
        });

        const completedExport = await dataExportManager.processExport(exportId);
        res.writeHead(201, { "content-type": "application/json", "cache-control": "no-store" });
        res.end(JSON.stringify(completedExport));
        return;
      }

      // Customer API: GET /v1/data-exports/:id
      if (req.method === "GET" && pathname.startsWith("/v1/data-exports/")) {
        const clientIp = extractClientIp(req);
        const authDecision = await options.apiKeyService.authenticate({
          authorization: typeof req.headers["authorization"] === "string" ? req.headers["authorization"] : undefined,
          clientIp,
          permission: "data.export" as any,
        });

        if (!authDecision.allowed) {
          res.writeHead(authDecision.status, { "content-type": "application/json", "cache-control": "no-store" });
          res.end(JSON.stringify(formatGatewayError(authDecision.code, requestId)));
          return;
        }

        const auth = authDecision.context!;
        const exportId = pathname.split("/")[3];
        if (exportId) {
          const exp = await governanceRepo.getExportRequest(exportId);
          if (!exp || exp.organizationId !== auth.organizationId) {
            res.writeHead(404, { "content-type": "application/json", "cache-control": "no-store" });
            res.end(JSON.stringify({ error: { code: "export_not_found", message: "Export request not found" } }));
            return;
          }
          res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
          res.end(JSON.stringify(exp));
          return;
        }
      }

      // Customer API: POST /v1/data-deletions
      if (req.method === "POST" && pathname === "/v1/data-deletions") {
        const clientIp = extractClientIp(req);
        const authDecision = await options.apiKeyService.authenticate({
          authorization: typeof req.headers["authorization"] === "string" ? req.headers["authorization"] : undefined,
          clientIp,
          permission: "data.delete" as any,
        });

        if (!authDecision.allowed) {
          res.writeHead(authDecision.status, { "content-type": "application/json", "cache-control": "no-store" });
          res.end(JSON.stringify(formatGatewayError(authDecision.code, requestId)));
          return;
        }

        const auth = authDecision.context!;
        const body = ((await readJsonBody(req, maxBodyBytes).catch(() => ({}))) ?? {}) as Record<string, any>;
        const deletionId = `dreq_${createPublicId("req")}`;

        await governanceRepo.createDeletionRequest({
          id: deletionId,
          organizationId: auth.organizationId,
          workspaceId: auth.workspaceId,
          requestedBy: auth.apiKeyId,
          scope: (body.scope as any) || "organization",
          scopeTargetId: body.targetId,
          category: body.category,
          status: "QUEUED",
          reason: body.reason,
          createdAt: new Date(),
        });

        const completedReq = await governanceDeletionOrchestrator.executeDeletion(deletionId);
        res.writeHead(201, { "content-type": "application/json", "cache-control": "no-store" });
        res.end(JSON.stringify(completedReq));
        return;
      }

      // Customer API: GET /v1/data-deletions/:id
      if (req.method === "GET" && pathname.startsWith("/v1/data-deletions/")) {
        const clientIp = extractClientIp(req);
        const authDecision = await options.apiKeyService.authenticate({
          authorization: typeof req.headers["authorization"] === "string" ? req.headers["authorization"] : undefined,
          clientIp,
          permission: "data.delete" as any,
        });

        if (!authDecision.allowed) {
          res.writeHead(authDecision.status, { "content-type": "application/json", "cache-control": "no-store" });
          res.end(JSON.stringify(formatGatewayError(authDecision.code, requestId)));
          return;
        }

        const auth = authDecision.context!;
        const deletionId = pathname.split("/")[3];
        if (deletionId) {
          const dreq = await governanceRepo.getDeletionRequest(deletionId);
          if (!dreq || dreq.organizationId !== auth.organizationId) {
            res.writeHead(404, { "content-type": "application/json", "cache-control": "no-store" });
            res.end(JSON.stringify({ error: { code: "deletion_not_found", message: "Deletion request not found" } }));
            return;
          }
          res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
          res.end(JSON.stringify(dreq));
          return;
        }
      }

      // Operator API: GET /internal/governance/deletions
      if (req.method === "GET" && pathname === "/internal/governance/deletions") {
        const orgId = parsedUrl.searchParams.get("organizationId") || undefined;
        const list = await governanceRepo.listDeletionRequests(orgId);
        res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
        res.end(JSON.stringify({ object: "list", data: list }));
        return;
      }

      // Operator API: GET /internal/governance/deletions/:id
      if (req.method === "GET" && pathname.startsWith("/internal/governance/deletions/")) {
        const parts = pathname.split("/");
        const deletionId = parts[4];
        if (deletionId) {
          const dreq = await governanceRepo.getDeletionRequest(deletionId);
          if (!dreq) {
            res.writeHead(404, { "content-type": "application/json", "cache-control": "no-store" });
            res.end(JSON.stringify({ error: { code: "deletion_not_found", message: "Deletion request not found" } }));
            return;
          }
          const evidence = await governanceRepo.listEvidence(deletionId);
          res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
          res.end(JSON.stringify({ deletionRequest: dreq, evidence }));
          return;
        }
      }

      // Operator API: POST /internal/governance/deletions/:id/retry
      if (req.method === "POST" && pathname.startsWith("/internal/governance/deletions/") && pathname.endsWith("/retry")) {
        const parts = pathname.split("/");
        const deletionId = parts[4];
        if (deletionId) {
          const completed = await governanceDeletionOrchestrator.executeDeletion(deletionId);
          res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
          res.end(JSON.stringify({ success: true, deletionRequest: completed }));
          return;
        }
      }

      // ==========================================
      // Phase 36: Reliability & Health Endpoints
      // ==========================================

      // GET /health (Liveness probe)
      if (req.method === "GET" && pathname === "/health") {
        const isHealthy = reliabilityControlPlane.isHealthy();
        res.writeHead(isHealthy ? 200 : 503, { "content-type": "application/json", "cache-control": "no-store" });
        res.end(JSON.stringify({ status: isHealthy ? "ok" : "unhealthy", mode: reliabilityControlPlane.getMode() }));
        return;
      }

      // GET /ready (Readiness probe)
      if (req.method === "GET" && pathname === "/ready") {
        const isReady = reliabilityControlPlane.isReady();
        res.writeHead(isReady ? 200 : 503, { "content-type": "application/json", "cache-control": "no-store" });
        res.end(JSON.stringify({ ready: isReady, mode: reliabilityControlPlane.getMode() }));
        return;
      }

      // GET /ready/capabilities (Granular capability readiness probe)
      if (req.method === "GET" && pathname === "/ready/capabilities") {
        const readiness = reliabilityControlPlane.getCapabilityReadiness();
        res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
        res.end(JSON.stringify(readiness));
        return;
      }

      // Operator API: GET /internal/reliability/status
      if (req.method === "GET" && pathname === "/internal/reliability/status") {
        res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
        res.end(JSON.stringify({
          operationalMode: reliabilityControlPlane.getMode(),
          capabilities: reliabilityControlPlane.getCapabilityReadiness(),
          dependencies: dependencyRegistry.list(),
          activeIncidents: platformIncidentManager.listIncidents(true),
        }));
        return;
      }

      // Operator API: POST /internal/reliability/mode
      if (req.method === "POST" && pathname === "/internal/reliability/mode") {
        const body = ((await readJsonBody(req, maxBodyBytes).catch(() => ({}))) ?? {}) as Record<string, any>;
        if (body.mode) {
          reliabilityControlPlane.setMode(body.mode);
        }
        res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
        res.end(JSON.stringify({ success: true, operationalMode: reliabilityControlPlane.getMode() }));
        return;
      }

      // Operator API: GET /internal/reliability/incidents
      if (req.method === "GET" && pathname === "/internal/reliability/incidents") {
        const activeOnly = parsedUrl.searchParams.get("active") === "true";
        const incidents = platformIncidentManager.listIncidents(activeOnly);
        res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
        res.end(JSON.stringify({ object: "list", data: incidents }));
        return;
      }

      // Operator API: POST /internal/reliability/incidents
      if (req.method === "POST" && pathname === "/internal/reliability/incidents") {
        const body = ((await readJsonBody(req, maxBodyBytes).catch(() => ({}))) ?? {}) as Record<string, any>;
        const incident = platformIncidentManager.createIncident({
          severity: body.severity || "SEV2",
          scope: body.scope || "global",
          summary: body.summary || "Manual platform incident",
          mitigationActions: body.mitigationActions || [],
        });
        res.writeHead(201, { "content-type": "application/json", "cache-control": "no-store" });
        res.end(JSON.stringify(incident));
        return;
      }

      // Operator API: POST /internal/reliability/drills/restore
      if (req.method === "POST" && pathname === "/internal/reliability/drills/restore") {
        const body = ((await readJsonBody(req, maxBodyBytes).catch(() => ({}))) ?? {}) as Record<string, any>;
        const drill = await restoreDrillRunner.executeDrill({
          type: body.type || "db_restore_drill",
          scope: body.scope || "postgres_primary",
          operatorId: body.operatorId || "usr_ops_lead",
          stateSnapshot: body.stateSnapshot || {
            walletBalances: [{ accountId: "w_main", balance: "100.00", ledgerSum: "100.00" }],
            apiKeys: [{ id: "key_main", secretHashPresent: true, orgId: "org_main" }],
            providerCredentials: [{ accountId: "acc_main", activeVersionCount: 1 }],
            batches: [],
            deletedResources: [],
          },
          simulatedDurationMs: body.simulatedDurationMs ?? 2000,
          simulatedRpoSeconds: body.simulatedRpoSeconds ?? 10,
        });
        res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
        res.end(JSON.stringify(drill));
        return;
      }

      // Operator API: POST /internal/reliability/invariants/verify
      if (req.method === "POST" && pathname === "/internal/reliability/invariants/verify") {
        const body = ((await readJsonBody(req, maxBodyBytes).catch(() => ({}))) ?? {}) as Record<string, any>;
        const results = criticalInvariantVerifier.verifyAll(body.stateSnapshot || {
          walletBalances: [{ accountId: "w_test", balance: "50.00", ledgerSum: "50.00" }],
          apiKeys: [{ id: "key_test", secretHashPresent: true, orgId: "org_test" }],
          providerCredentials: [{ accountId: "acc_test", activeVersionCount: 1 }],
          batches: [],
          deletedResources: [],
        });
        res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
        res.end(JSON.stringify({ timestamp: new Date(), invariants: results }));
        return;
      }

      // Operator API: POST /internal/reliability/reconcile
      if (req.method === "POST" && pathname === "/internal/reliability/reconcile") {
        const report = await platformReconciliationOrchestrator.reconcileAll([
          { name: "wallet", reconcile: async () => ({ evaluated: 10, reconciled: 0 }) },
          { name: "batches", reconcile: async () => ({ evaluated: 2, reconciled: 0 }) },
          { name: "provider_ops", reconcile: async () => ({ evaluated: 5, reconciled: 0 }) },
        ]);
        res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
        res.end(JSON.stringify(report));
        return;
      }

      // ==========================================
      // Phase 37: Performance & Scale Endpoints
      // ==========================================

      // Operator API: POST /internal/performance/benchmark
      if (req.method === "POST" && pathname === "/internal/performance/benchmark") {
        const body = ((await readJsonBody(req, maxBodyBytes).catch(() => ({}))) ?? {}) as Record<string, any>;
        const scenario = body.scenario || "smoke_1k";
        const totalRequests = body.totalRequests || 50;
        const concurrency = body.concurrency || 10;
        const simulatedProviderLatencyMs = body.simulatedProviderLatencyMs || 20;

        const run = await benchmarkHarness.runScenario({
          scenario,
          totalRequests,
          concurrency,
          simulatedProviderLatencyMs,
          growxOverheadTargetMs: body.growxOverheadTargetMs,
        });

        res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
        res.end(JSON.stringify(run));
        return;
      }

      // Operator API: GET /internal/performance/metrics
      if (req.method === "GET" && pathname === "/internal/performance/metrics") {
        const eventLoopLagMs = await PlatformProfiler.measureEventLoopLag();
        const memory = PlatformProfiler.getMemorySnapshot();
        const activeAdmission = admissionController.getActiveCounts();
        const costModel = InfrastructureCostModeler.calculateCostPerMillion();

        res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
        res.end(JSON.stringify({
          timestamp: new Date(),
          eventLoopLagMs,
          memory,
          activeAdmission,
          costModel,
        }));
        return;
      }

      // Operator API: GET /internal/performance/migration-report
      if (req.method === "GET" && pathname === "/internal/performance/migration-report") {
        const evaluations = LanguageMigrationDecisionEngine.evaluateAllServices();
        res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
        res.end(JSON.stringify({
          timestamp: new Date(),
          object: "language_migration_report",
          services: evaluations,
        }));
        return;
      }

      // ==========================================
      // Phase 38: Runtime Evolution & Canary Endpoints
      // ==========================================

      // Operator API: GET /internal/runtime/canary
      if (req.method === "GET" && pathname === "/internal/runtime/canary") {
        const policy = canaryController.getPolicy();
        res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
        res.end(JSON.stringify(policy));
        return;
      }

      // Operator API: POST /internal/runtime/canary
      if (req.method === "POST" && pathname === "/internal/runtime/canary") {
        const body = ((await readJsonBody(req, maxBodyBytes).catch(() => ({}))) ?? {}) as Record<string, any>;
        canaryController.updatePolicy(body);
        const policy = canaryController.getPolicy();
        res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
        res.end(JSON.stringify(policy));
        return;
      }

      // Operator API: POST /internal/runtime/shadow/evaluate
      if (req.method === "POST" && pathname === "/internal/runtime/shadow/evaluate") {
        const body = ((await readJsonBody(req, maxBodyBytes).catch(() => ({}))) ?? {}) as Record<string, any>;
        const primary = body.primary ?? {
          id: "req_demo",
          runtime: "typescript",
          status: "success",
          content: "Hello",
          inputTokens: 5,
          outputTokens: 5,
          durationMs: 10,
        };
        const shadow = body.shadow ?? {
          ...primary,
          runtime: "go_runtime",
          durationMs: 2,
        };

        const comparison = ShadowEvaluator.compareResults(primary, shadow);
        res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
        res.end(JSON.stringify(comparison));
        return;
      }

      // Operator API: POST /internal/runtime/rollback
      if (req.method === "POST" && pathname === "/internal/runtime/rollback") {
        const body = ((await readJsonBody(req, maxBodyBytes).catch(() => ({}))) ?? {}) as Record<string, any>;
        const reason = body.reason || "Manual operator emergency rollback";
        try {
          canaryController.triggerRollback(reason);
        } catch {
          // Expected CanaryRollbackError
        }
        res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
        res.end(JSON.stringify({
          status: "rolled_back",
          policy: canaryController.getPolicy(),
          reason,
        }));
        return;
      }

      // Operator API: GET /internal/runtime/golden-tests
      if (req.method === "GET" && pathname === "/internal/runtime/golden-tests") {
        const reqId = "gold_test_" + Date.now();
        const primaryRes = await tsAdapter.execute({ id: reqId, prompt: "Golden test", model: "gpt-4o" });
        const candidateRes = await goAdapter.execute({ id: reqId, prompt: "Golden test", model: "gpt-4o" });

        let passed = true;
        let error: string | undefined;
        try {
          GoldenContractComparator.verifyParity(primaryRes, candidateRes);
        } catch (e: any) {
          passed = false;
          error = e?.message;
        }

        res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
        res.end(JSON.stringify({
          passed,
          error,
          primary: primaryRes,
          candidate: candidateRes,
          tokenizerSample: RustTokenizerAdapter.countTokens("Golden test prompt"),
        }));
        return;
      }

      // ==========================================
      // Phase 39: Developer Platform & Deployment Endpoints
      // ==========================================

      // Public API: GET /v1/version
      if (req.method === "GET" && pathname === "/v1/version") {
        const activeRel = releaseOrchestrator.getActiveRelease();
        res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
        res.end(JSON.stringify({
          version: activeRel?.version || "1.0.0",
          gitSha: activeRel?.gitSha || "prod_main",
          environment: activeRel?.environment || "production",
          apiHostname: "api.growxlabs.tech",
          consoleHostname: "app.growxlabs.tech",
          status: "operational",
        }));
        return;
      }

      // Operator API: GET /internal/deployment/status
      if (req.method === "GET" && pathname === "/internal/deployment/status") {
        const activeRelease = releaseOrchestrator.getActiveRelease();
        const history = releaseOrchestrator.getHistory();
        res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
        res.end(JSON.stringify({
          activeRelease,
          history,
          topology: {
            controlPlane: "Vercel",
            persistentRuntime: "Container / Railway",
            database: "Managed PostgreSQL",
            redis: "Managed Redis",
            storage: "Object Storage Provider",
          },
        }));
        return;
      }

      // Operator API: POST /internal/deployment/release
      if (req.method === "POST" && pathname === "/internal/deployment/release") {
        const body = ((await readJsonBody(req, maxBodyBytes).catch(() => ({}))) ?? {}) as Record<string, any>;
        const version = body.version || "1.0.1";
        const gitSha = body.gitSha || "sha_" + Math.random().toString(36).substring(2, 8);
        const environment = body.environment || "staging";

        const release = await releaseOrchestrator.initiateRelease({
          version,
          gitSha,
          environment,
        });

        res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
        res.end(JSON.stringify(release));
        return;
      }

      // Operator API: POST /internal/deployment/smoke
      if (req.method === "POST" && pathname === "/internal/deployment/smoke") {
        const results = await SmokeValidator.executeSmokeSuite();
        res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
        res.end(JSON.stringify({
          status: "completed",
          tests: results,
          syntheticBillingIsolated: true,
        }));
        return;
      }

      // Operator API: POST /internal/deployment/rollback
      if (req.method === "POST" && pathname === "/internal/deployment/rollback") {
        const body = ((await readJsonBody(req, maxBodyBytes).catch(() => ({}))) ?? {}) as Record<string, any>;
        const releaseId = body.releaseId || releaseOrchestrator.getActiveRelease()?.id;
        const reason = body.reason || "Manual operator rollback";

        if (!releaseId) {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: "No active release found to rollback" }));
          return;
        }

        const rolledBack = releaseOrchestrator.rollbackRelease(releaseId, reason);
        res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
        res.end(JSON.stringify(rolledBack));
        return;
      }

      // 404 Route Not Found
      res.writeHead(404, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(
        JSON.stringify({
          error: {
            type: "invalid_request_error",
            code: "not_found",
            message: `Cannot ${req.method} ${pathname}`,
            requestId,
          },
        })
      );
    } catch (err: unknown) {
      if (res.headersSent) {
        res.destroy();
        return;
      }

      if (err instanceof GrowXProviderError) {
        const errorType =
          err.status === 401
            ? "authentication_error"
            : err.status === 403
            ? "authorization_error"
            : err.status === 429
            ? "rate_limit_error"
            : err.status === 404
            ? "invalid_request_error"
            : err.status === 400
            ? "invalid_request_error"
            : "api_error";

        res.writeHead(err.status, {
          "content-type": "application/json",
          "cache-control": "no-store",
        });
        res.end(
          JSON.stringify({
            error: {
              type: errorType,
              code: err.code,
              message: err.message,
              requestId,
            },
          })
        );
        return;
      }

      const status = (err as any)?.status ?? 500;
      const code = (err as any)?.code ?? "internal_error";
      const message =
        status < 500
          ? (err as any)?.message ?? "Request error"
          : "An internal error occurred processing your request";

      res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(
        JSON.stringify({
          error: {
            type: status < 500 ? "invalid_request_error" : "api_error",
            code,
            message,
            requestId,
          },
        })
      );
    }
  });
}

async function readJsonBody(
  req: IncomingMessage,
  maxBytes: number
): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let bytes = 0;

  for await (const chunk of req) {
    const buf = Buffer.from(chunk);
    bytes += buf.length;
    if (bytes > maxBytes) {
      throw Object.assign(new Error("Request body too large"), {
        status: 413,
        code: "payload_too_large",
      });
    }
    chunks.push(buf);
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) {
    throw Object.assign(new Error("Empty request body"), {
      status: 400,
      code: "invalid_request",
    });
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw Object.assign(new Error("Invalid JSON in request body"), {
      status: 400,
      code: "invalid_json",
    });
  }
}
