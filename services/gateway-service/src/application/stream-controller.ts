/**
 * GatewayStreamController — Canonical orchestration unit for a single streaming request.
 *
 * Manages:
 * - Stream state machine with valid transitions
 * - Cancellation chain: client signal → gateway AbortController → provider
 * - Deadline timer (max total stream duration)
 * - Idle timeout (max gap between chunks)
 * - TTFT (time-to-first-token) capture
 * - Usage/latency persistence on finalization
 * - Error/cancel event emission
 * - Active stream gauge via StreamRegistry
 * - Idempotent finalization: first terminal transition wins
 */

import {
  GrowXProviderError,
  type NormalizedStreamEvent,
  type OpenAIChatCompletionChunk,
  type ProviderUsage,
} from "@growx/contracts";
import type { MachineAuthContext } from "@growx/api-key-service";
import { createPublicId } from "@growx/ids";
import {
  StreamState,
  isTerminal,
  assertTransition,
  createStreamMetrics,
  type StreamMetrics,
} from "../domain/stream-state.js";
import type {
  GatewayRequestEntity,
  StreamExecutionOptions,
} from "../domain/types.js";
import type { IGatewayEvents } from "./events.js";
import type { IGatewayRepository } from "./repository.js";
import type { StreamRegistry } from "./shutdown.js";
import type { UsageMeteringService } from "@growx/metering";

export interface StreamControllerDeps {
  repository: IGatewayRepository;
  events: IGatewayEvents;
  registry: StreamRegistry;
  usageMetering?: UsageMeteringService | undefined;
}

export interface StreamControllerContext {
  requestId: string;
  auth: MachineAuthContext;
  canonicalModelId: string;
  providerId: string;
  requestedModel: string;
  startTime: number;
}

export class GatewayStreamController {
  private state: StreamState = StreamState.INITIAL;
  private readonly metrics: StreamMetrics = createStreamMetrics();
  private readonly abortController: AbortController;
  private deadlineTimer: ReturnType<typeof setTimeout> | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private finalized = false;
  private finalUsage: ProviderUsage | null = null;
  private lastFinishReason: string | null = null;

  // Configuration with defaults
  private readonly deadlineMs: number;
  private readonly idleTimeoutMs: number;
  private readonly heartbeatIntervalMs: number;
  private readonly includeUsage: boolean;

  constructor(
    private readonly deps: StreamControllerDeps,
    private readonly ctx: StreamControllerContext,
    private readonly options: StreamExecutionOptions = {}
  ) {
    this.deadlineMs = options.deadlineMs ?? 300_000; // 5 min
    this.idleTimeoutMs = options.idleTimeoutMs ?? 60_000; // 1 min
    this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? 30_000; // 30s
    this.includeUsage = options.includeUsage ?? false;

    // Create internal abort controller that merges client cancellation
    this.abortController = new AbortController();

    // Wire client cancellation signal if provided
    if (options.cancellationSignal) {
      if (options.cancellationSignal.aborted) {
        this.abortController.abort(options.cancellationSignal.reason);
      } else {
        options.cancellationSignal.addEventListener(
          "abort",
          () => this.abortController.abort(options.cancellationSignal?.reason),
          { once: true }
        );
      }
    }
  }

  /** The combined abort signal to pass to provider service. */
  get signal(): AbortSignal {
    return this.abortController.signal;
  }

  /** Current stream state. */
  get currentState(): StreamState {
    return this.state;
  }

  /** Current stream metrics (read-only snapshot). */
  get currentMetrics(): Readonly<StreamMetrics> {
    return this.metrics;
  }

  /** Whether usage should be included in the final stream chunk. */
  get shouldIncludeUsage(): boolean {
    return this.includeUsage;
  }

  /** Whether any model output (text or tool call) has been written to client. */
  get hasEmittedOutput(): boolean {
    return this.metrics.hasEmittedModelOutput;
  }

  /** Final usage reported by provider. */
  get usage() {
    return this.finalUsage;
  }

  // ─── State Transitions ───

  /** Transition to VALIDATED after auth/model/route resolution passes. */
  transitionToValidated(): void {
    this.transition(StreamState.VALIDATED);
  }

  /** Transition to CONNECTING before calling provider. */
  transitionToConnecting(): void {
    this.transition(StreamState.CONNECTING);
    this.startDeadlineTimer();
  }

  /** Transition to STREAMING on first provider event. */
  transitionToStreaming(): void {
    this.transition(StreamState.STREAMING);
    this.resetIdleTimer();
  }

  /** Transition to COMPLETING when provider stream ends naturally. */
  transitionToCompleting(): void {
    this.transition(StreamState.COMPLETING);
    this.clearTimers();
  }

  // ─── Event Processing ───

  /**
   * Process a normalized stream event from the provider.
   * Updates metrics, resets idle timer, captures TTFT and usage.
   *
   * Returns the event for further processing (chunk translation).
   */
  processProviderEvent(event: NormalizedStreamEvent): NormalizedStreamEvent {
    const now = Date.now();
    this.metrics.lastChunkAt = now;

    // Reset idle timer on every chunk
    this.resetIdleTimer();

    // Track TTFT on first model output (text or tool-call delta/started)
    if (
      !this.metrics.hasEmittedModelOutput &&
      (event.type === "output_text.delta" ||
        event.type === "tool_call.delta" ||
        event.type === "tool_call.started")
    ) {
      this.metrics.firstTokenAt = now;
      this.metrics.hasEmittedModelOutput = true;
    }

    // Capture finish reason
    if (event.finishReason) {
      this.lastFinishReason = event.finishReason;
    }

    // Capture usage from response.completed or usage events
    if (event.type === "response.completed" && event.response?.usage) {
      this.finalUsage = event.response.usage;
    } else if (event.type === "usage" && event.usage) {
      this.finalUsage = event.usage;
    }

    return event;
  }

  /**
   * Record that a chunk was written to the client.
   * Tracks bytes written and chunks emitted.
   */
  recordChunkWritten(byteLength: number): void {
    this.metrics.chunksEmitted++;
    this.metrics.bytesWritten += byteLength;
  }

  // ─── Heartbeat ───

  /**
   * Start the heartbeat timer. Returns a callback for each heartbeat tick
   * that the caller can use to write the heartbeat to the response.
   */
  startHeartbeat(onHeartbeat: () => void): void {
    if (this.heartbeatIntervalMs <= 0) return;
    this.heartbeatTimer = setInterval(() => {
      if (!isTerminal(this.state)) {
        onHeartbeat();
      }
    }, this.heartbeatIntervalMs);
  }

  // ─── Finalization ───

  /**
   * Idempotent finalization. Only the first call with a valid terminal
   * transition takes effect. Subsequent calls are no-ops.
   *
   * This ensures that racing terminal conditions (e.g., deadline timeout
   * firing simultaneously with client abort) don't produce double-writes.
   */
  async finalizeOnce(
    terminalState: StreamState.COMPLETED | StreamState.FAILED | StreamState.CANCELLED | StreamState.TIMED_OUT,
    error?: Error | undefined
  ): Promise<void> {
    if (this.finalized) return;
    this.finalized = true;

    this.clearTimers();

    // Transition through COMPLETING if we're in STREAMING
    if (this.state === StreamState.STREAMING && terminalState === StreamState.COMPLETED) {
      this.transition(StreamState.COMPLETING);
    }

    // Attempt terminal transition — if we're already terminal, just return
    if (isTerminal(this.state)) return;

    try {
      this.transition(terminalState);
    } catch {
      // If transition fails (e.g., already terminal), just return
      return;
    }

    const endTime = Date.now();
    const totalLatency = endTime - this.ctx.startTime;

    // Persist usage if available
    if (this.finalUsage && terminalState === StreamState.COMPLETED) {
      await this.deps.repository.saveUsageSnapshot({
        id: createPublicId("usage"),
        requestId: this.ctx.requestId,
        inputTokens: this.finalUsage.inputTokens,
        outputTokens: this.finalUsage.outputTokens,
        totalTokens: this.finalUsage.totalTokens,
        cachedInputTokens: this.finalUsage.cachedInputTokens ?? 0,
        reasoningTokens: this.finalUsage.reasoningTokens ?? 0,
        source: this.finalUsage.source,
        createdAt: new Date(endTime),
      });
    }

    // Persist latency record (always, for all terminal states)
    const providerLatencyMs = this.metrics.lastChunkAt
      ? this.metrics.lastChunkAt - this.ctx.startTime
      : totalLatency;

    await this.deps.repository.saveLatencyRecord({
      requestId: this.ctx.requestId,
      gatewayOverheadMs: Math.max(0, totalLatency - providerLatencyMs),
      providerLatencyMs,
      ...(this.metrics.firstTokenAt
        ? { timeToFirstTokenMs: this.metrics.firstTokenAt - this.ctx.startTime }
        : {}),
      totalLatencyMs: totalLatency,
    });

    // Map terminal state to DB status
    const statusMap: Record<string, string> = {
      [StreamState.COMPLETED]: "completed",
      [StreamState.FAILED]: "failed",
      [StreamState.CANCELLED]: "cancelled",
      [StreamState.TIMED_OUT]: "timed_out",
    };

    const errorCode = error
      ? error instanceof GrowXProviderError
        ? error.code
        : error.name ?? "internal_error"
      : terminalState === StreamState.TIMED_OUT
        ? "gateway_timeout"
        : undefined;

    await this.deps.repository.updateRequest(this.ctx.requestId, {
      status: statusMap[terminalState] as any,
      completedAt: new Date(endTime),
      latencyMs: totalLatency,
      ...(this.lastFinishReason ? { finishReason: this.lastFinishReason as any } : {}),
      ...(errorCode ? { errorCode } : {}),
    });

    if (this.finalUsage && terminalState === StreamState.COMPLETED) {
      const attemptId = `att_stream_${this.ctx.requestId}`;
      await this.deps.usageMetering?.recordAttemptCompleted({
        attemptId,
        requestId: this.ctx.requestId,
        completedAt: new Date(endTime),
        durationMs: totalLatency,
        ttftMs: this.metrics.firstTokenAt ? this.metrics.firstTokenAt - this.ctx.startTime : undefined,
        usage: {
          inputTokens: this.finalUsage.inputTokens,
          outputTokens: this.finalUsage.outputTokens,
          totalTokens: this.finalUsage.totalTokens,
          cachedInputTokens: this.finalUsage.cachedInputTokens,
          reasoningTokens: this.finalUsage.reasoningTokens,
          source: this.finalUsage.source as any,
        },
      }).catch(() => {});
    }

    await this.deps.usageMetering?.recordRequestCompleted({
      requestId: this.ctx.requestId,
      status: (statusMap[terminalState] as any) ?? "completed",
      completedAt: new Date(endTime),
      durationMs: totalLatency,
      ttftMs: this.metrics.firstTokenAt ? this.metrics.firstTokenAt - this.ctx.startTime : undefined,
      errorCode,
    }).catch(() => {});

    // Emit terminal events
    if (terminalState === StreamState.COMPLETED) {
      if (this.finalUsage) {
        await this.deps.events.emitRequestCompleted({
          requestId: this.ctx.requestId,
          organizationId: this.ctx.auth.organizationId,
          workspaceId: this.ctx.auth.workspaceId,
          apiKeyId: this.ctx.auth.apiKeyId,
          canonicalModel: this.ctx.canonicalModelId,
          providerId: this.ctx.providerId,
          usage: this.finalUsage,
          latencyMs: totalLatency,
        });
      }
    } else if (terminalState === StreamState.CANCELLED) {
      await this.deps.events.emitRequestCancelled({
        requestId: this.ctx.requestId,
        organizationId: this.ctx.auth.organizationId,
        workspaceId: this.ctx.auth.workspaceId,
        apiKeyId: this.ctx.auth.apiKeyId,
        ...(this.ctx.canonicalModelId ? { canonicalModel: this.ctx.canonicalModelId } : {}),
        latencyMs: totalLatency,
      });
    } else {
      // FAILED or TIMED_OUT
      const code = errorCode ?? "internal_error";
      await this.deps.repository.saveErrorRecord({
        id: createPublicId("err"),
        requestId: this.ctx.requestId,
        code,
        retryable: error instanceof GrowXProviderError ? error.retryable : false,
        safeMessage: error instanceof Error ? error.message : "Stream terminated",
        createdAt: new Date(endTime),
      });

      await this.deps.events.emitRequestFailed({
        requestId: this.ctx.requestId,
        organizationId: this.ctx.auth.organizationId,
        workspaceId: this.ctx.auth.workspaceId,
        apiKeyId: this.ctx.auth.apiKeyId,
        ...(this.ctx.canonicalModelId ? { canonicalModel: this.ctx.canonicalModelId } : {}),
        errorCode: code,
        latencyMs: totalLatency,
      });
    }

    // Unregister from active streams
    this.deps.registry.unregister(this.ctx.requestId);
  }

  /**
   * Abort the stream. Can be called from any non-terminal state.
   * Triggers the abort controller which propagates to provider adapter.
   */
  abort(reason?: string): void {
    if (!this.abortController.signal.aborted) {
      this.abortController.abort(reason ?? "Stream aborted");
    }
  }

  /**
   * Clean up all resources. Must be called in a finally block.
   */
  cleanup(): void {
    this.clearTimers();
    if (!this.finalized) {
      this.deps.registry.unregister(this.ctx.requestId);
    }
  }

  // ─── Private Helpers ───

  private transition(to: StreamState): void {
    this.state = assertTransition(this.state, to);
  }

  private startDeadlineTimer(): void {
    if (this.deadlineMs <= 0) return;
    this.deadlineTimer = setTimeout(() => {
      if (!isTerminal(this.state)) {
        this.abort("Stream deadline exceeded");
        // The abort will cause the provider stream to throw,
        // which will trigger finalizeOnce with TIMED_OUT
      }
    }, this.deadlineMs);
  }

  private resetIdleTimer(): void {
    if (this.idleTimeoutMs <= 0) return;
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      if (!isTerminal(this.state)) {
        this.abort("Stream idle timeout exceeded");
      }
    }, this.idleTimeoutMs);
  }

  private clearTimers(): void {
    if (this.deadlineTimer) {
      clearTimeout(this.deadlineTimer);
      this.deadlineTimer = null;
    }
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
}
