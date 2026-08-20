export class PerformanceError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = "PerformanceError";
  }
}

export class AdmissionRejectedError extends PerformanceError {
  constructor(public reason: string, public retryAfterMs: number = 1000) {
    super("ADMISSION_REJECTED", `Request admission rejected: ${reason}`);
    this.name = "AdmissionRejectedError";
  }
}

export class OverloadSheddingError extends PerformanceError {
  constructor(public priority: string) {
    super(
      "OVERLOAD_SHEDDING",
      `Request shed under platform overload (priority: ${priority})`
    );
    this.name = "OverloadSheddingError";
  }
}

export class BenchmarkExecutionError extends PerformanceError {
  constructor(message: string) {
    super("BENCHMARK_EXECUTION_FAILED", message);
    this.name = "BenchmarkExecutionError";
  }
}
