import { describe, it, expect } from "vitest";
import {
  ToolLoopDetector,
  ToolLoopDetectedError,
} from "../src/loop-detector.js";

describe("Tool Loop Detector", () => {
  it("allows normal varied tool executions", () => {
    const detector = new ToolLoopDetector({
      maxConsecutiveIdenticalCalls: 3,
      maxRounds: 5,
      maxTotalCalls: 10,
    });
    detector.incrementRound();
    detector.recordCall("search", "hash1");
    detector.recordCall("fetch", "hash2");
    detector.incrementRound();
    detector.recordCall("summarize", "hash3");

    expect(detector.getMetrics().roundCount).toBe(2);
    expect(detector.getMetrics().totalCalls).toBe(3);
  });

  it("throws ToolLoopDetectedError when identical tool is called 3 consecutive times", () => {
    const detector = new ToolLoopDetector({
      maxConsecutiveIdenticalCalls: 3,
      maxRounds: 10,
      maxTotalCalls: 20,
    });
    detector.recordCall("ping", "hash_same");
    detector.recordCall("ping", "hash_same");

    expect(() => {
      detector.recordCall("ping", "hash_same");
    }).toThrow(ToolLoopDetectedError);
  });

  it("throws when max round limit is exceeded", () => {
    const detector = new ToolLoopDetector({
      maxConsecutiveIdenticalCalls: 3,
      maxRounds: 2,
      maxTotalCalls: 10,
    });
    detector.incrementRound();
    detector.incrementRound();

    expect(() => {
      detector.incrementRound();
    }).toThrow(ToolLoopDetectedError);
  });
});
