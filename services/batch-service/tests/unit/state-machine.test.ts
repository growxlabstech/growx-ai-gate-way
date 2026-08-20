import { describe, it, expect } from "vitest";
import {
  isValidJobTransition,
  assertValidJobTransition,
  isTerminalJobStatus,
  isValidItemTransition,
  assertValidItemTransition,
  isTerminalItemStatus,
} from "../../src/domain/state-machine.js";
import { BatchConcurrencyError } from "../../src/domain/types.js";

describe("Batch State Machine", () => {
  describe("Job Transitions", () => {
    it("allows valid transitions", () => {
      expect(isValidJobTransition("validating", "queued")).toBe(true);
      expect(isValidJobTransition("queued", "running")).toBe(true);
      expect(isValidJobTransition("running", "finalizing")).toBe(true);
      expect(isValidJobTransition("finalizing", "completed")).toBe(true);
      expect(isValidJobTransition("finalizing", "partially_completed")).toBe(true);
      expect(isValidJobTransition("finalizing", "failed")).toBe(true);
      expect(isValidJobTransition("queued", "cancelling")).toBe(true);
      expect(isValidJobTransition("cancelling", "cancelled")).toBe(true);
    });

    it("rejects invalid transitions", () => {
      expect(isValidJobTransition("completed", "running")).toBe(false);
      expect(isValidJobTransition("failed", "queued")).toBe(false);
      expect(isValidJobTransition("cancelled", "finalizing")).toBe(false);
      expect(() => assertValidJobTransition("completed", "running", "b1")).toThrowError(BatchConcurrencyError);
    });

    it("correctly identifies terminal job states", () => {
      expect(isTerminalJobStatus("completed")).toBe(true);
      expect(isTerminalJobStatus("partially_completed")).toBe(true);
      expect(isTerminalJobStatus("failed")).toBe(true);
      expect(isTerminalJobStatus("cancelled")).toBe(true);
      expect(isTerminalJobStatus("expired")).toBe(true);
      expect(isTerminalJobStatus("running")).toBe(false);
      expect(isTerminalJobStatus("queued")).toBe(false);
    });
  });

  describe("Item Transitions", () => {
    it("allows valid item transitions", () => {
      expect(isValidItemTransition("pending", "queued")).toBe(true);
      expect(isValidItemTransition("queued", "running")).toBe(true);
      expect(isValidItemTransition("running", "succeeded")).toBe(true);
      expect(isValidItemTransition("running", "failed")).toBe(true);
      expect(isValidItemTransition("running", "retry_wait")).toBe(true);
      expect(isValidItemTransition("retry_wait", "queued")).toBe(true);
      expect(isValidItemTransition("running", "cancelled")).toBe(true);
    });

    it("rejects invalid item transitions", () => {
      expect(isValidItemTransition("succeeded", "running")).toBe(false);
      expect(isValidItemTransition("failed", "succeeded")).toBe(false);
      expect(() => assertValidItemTransition("succeeded", "queued", "item1")).toThrowError(BatchConcurrencyError);
    });

    it("correctly identifies terminal item states", () => {
      expect(isTerminalItemStatus("succeeded")).toBe(true);
      expect(isTerminalItemStatus("failed")).toBe(true);
      expect(isTerminalItemStatus("cancelled")).toBe(true);
      expect(isTerminalItemStatus("running")).toBe(false);
      expect(isTerminalItemStatus("retry_wait")).toBe(false);
    });
  });
});
