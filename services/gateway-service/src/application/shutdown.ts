/**
 * StreamRegistry — Tracks active GatewayStreamController instances
 * for active stream gauging and graceful shutdown.
 *
 * - Thread-safe (single-threaded Node.js, but protects against concurrent async)
 * - Provides active stream count for health checks
 * - Graceful shutdown: stop accepting, grace period, then abort remaining
 */

import type { GatewayStreamController } from "./stream-controller.js";

export class StreamRegistry {
  private readonly active = new Map<string, GatewayStreamController>();
  private shuttingDown = false;

  /** Register an active stream controller. */
  register(requestId: string, controller: GatewayStreamController): void {
    if (this.shuttingDown) {
      throw new Error("Server is shutting down — cannot accept new streams");
    }
    this.active.set(requestId, controller);
  }

  /** Unregister a stream controller (called on finalization). */
  unregister(requestId: string): void {
    this.active.delete(requestId);
  }

  /** Current number of active streams. */
  get activeCount(): number {
    return this.active.size;
  }

  /** Whether the registry is in shutdown mode. */
  get isShuttingDown(): boolean {
    return this.shuttingDown;
  }

  /**
   * Initiate graceful shutdown:
   * 1. Stop accepting new streams
   * 2. Wait up to graceMs for active streams to complete
   * 3. Abort any remaining active streams
   *
   * Returns a promise that resolves when all streams are terminated.
   */
  async initiateGracefulShutdown(graceMs = 30_000): Promise<void> {
    this.shuttingDown = true;

    if (this.active.size === 0) return;

    // Wait for active streams to complete within grace period
    const deadline = Date.now() + graceMs;

    await new Promise<void>((resolve) => {
      const checkInterval = setInterval(() => {
        if (this.active.size === 0 || Date.now() >= deadline) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
    });

    // Abort remaining streams after grace period
    if (this.active.size > 0) {
      const remaining = [...this.active.entries()];
      for (const [requestId, controller] of remaining) {
        try {
          controller.abort("Server shutting down");
        } catch {
          // Ignore abort errors during shutdown
        }
        this.active.delete(requestId);
      }
    }
  }

  /** Reset the registry (for testing). */
  reset(): void {
    this.active.clear();
    this.shuttingDown = false;
  }
}
