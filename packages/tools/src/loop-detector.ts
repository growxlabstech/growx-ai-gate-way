export class ToolLoopDetectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolLoopDetectedError";
  }
}

export interface LoopDetectorConfig {
  maxConsecutiveIdenticalCalls: number;
  maxRounds: number;
  maxTotalCalls: number;
}

export const DEFAULT_LOOP_DETECTOR_CONFIG: LoopDetectorConfig = {
  maxConsecutiveIdenticalCalls: 3,
  maxRounds: 10,
  maxTotalCalls: 20,
};

export class ToolLoopDetector {
  private readonly callHistory: Array<{ name: string; argumentsHash: string }> = [];
  private roundCount = 0;
  private totalCalls = 0;

  constructor(private readonly config: LoopDetectorConfig = DEFAULT_LOOP_DETECTOR_CONFIG) {}

  incrementRound(): void {
    this.roundCount += 1;
    if (this.roundCount > this.config.maxRounds) {
      throw new ToolLoopDetectedError(`Tool execution exceeded maximum round limit of ${this.config.maxRounds}`);
    }
  }

  recordCall(name: string, argumentsHash: string): void {
    this.totalCalls += 1;
    if (this.totalCalls > this.config.maxTotalCalls) {
      throw new ToolLoopDetectedError(`Total tool call count ${this.totalCalls} exceeded maximum limit of ${this.config.maxTotalCalls}`);
    }

    // Check consecutive identical calls
    const recent = this.callHistory.slice(-this.config.maxConsecutiveIdenticalCalls + 1);
    const allMatch =
      recent.length === this.config.maxConsecutiveIdenticalCalls - 1 &&
      recent.every((c) => c.name === name && c.argumentsHash === argumentsHash);

    if (allMatch && recent.length > 0) {
      throw new ToolLoopDetectedError(`Tool '${name}' with identical arguments was called ${this.config.maxConsecutiveIdenticalCalls} consecutive times. Infinite loop detected.`);
    }

    this.callHistory.push({ name, argumentsHash });
  }

  getMetrics() {
    return {
      roundCount: this.roundCount,
      totalCalls: this.totalCalls,
    };
  }
}
