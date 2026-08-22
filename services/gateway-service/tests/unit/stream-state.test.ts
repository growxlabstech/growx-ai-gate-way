import { describe, it, expect } from "vitest";
import {
  StreamState,
  isTerminal,
  isValidTransition,
  assertTransition,
  StreamTransitionError,
  createStreamMetrics,
} from "../../src/domain/stream-state.js";

describe("StreamState", () => {
  describe("isTerminal", () => {
    it("returns true for COMPLETED", () => {
      expect(isTerminal(StreamState.COMPLETED)).toBe(true);
    });

    it("returns true for FAILED", () => {
      expect(isTerminal(StreamState.FAILED)).toBe(true);
    });

    it("returns true for CANCELLED", () => {
      expect(isTerminal(StreamState.CANCELLED)).toBe(true);
    });

    it("returns true for TIMED_OUT", () => {
      expect(isTerminal(StreamState.TIMED_OUT)).toBe(true);
    });

    it("returns false for non-terminal states", () => {
      expect(isTerminal(StreamState.INITIAL)).toBe(false);
      expect(isTerminal(StreamState.VALIDATED)).toBe(false);
      expect(isTerminal(StreamState.CONNECTING)).toBe(false);
      expect(isTerminal(StreamState.STREAMING)).toBe(false);
      expect(isTerminal(StreamState.COMPLETING)).toBe(false);
    });
  });

  describe("isValidTransition", () => {
    it("allows INITIAL → VALIDATED", () => {
      expect(
        isValidTransition(StreamState.INITIAL, StreamState.VALIDATED),
      ).toBe(true);
    });

    it("allows INITIAL → FAILED", () => {
      expect(isValidTransition(StreamState.INITIAL, StreamState.FAILED)).toBe(
        true,
      );
    });

    it("allows INITIAL → CANCELLED", () => {
      expect(
        isValidTransition(StreamState.INITIAL, StreamState.CANCELLED),
      ).toBe(true);
    });

    it("allows VALIDATED → CONNECTING", () => {
      expect(
        isValidTransition(StreamState.VALIDATED, StreamState.CONNECTING),
      ).toBe(true);
    });

    it("allows CONNECTING → STREAMING", () => {
      expect(
        isValidTransition(StreamState.CONNECTING, StreamState.STREAMING),
      ).toBe(true);
    });

    it("allows CONNECTING → FAILED", () => {
      expect(
        isValidTransition(StreamState.CONNECTING, StreamState.FAILED),
      ).toBe(true);
    });

    it("allows CONNECTING → TIMED_OUT", () => {
      expect(
        isValidTransition(StreamState.CONNECTING, StreamState.TIMED_OUT),
      ).toBe(true);
    });

    it("allows STREAMING → COMPLETING", () => {
      expect(
        isValidTransition(StreamState.STREAMING, StreamState.COMPLETING),
      ).toBe(true);
    });

    it("allows STREAMING → FAILED", () => {
      expect(isValidTransition(StreamState.STREAMING, StreamState.FAILED)).toBe(
        true,
      );
    });

    it("allows STREAMING → CANCELLED", () => {
      expect(
        isValidTransition(StreamState.STREAMING, StreamState.CANCELLED),
      ).toBe(true);
    });

    it("allows STREAMING → TIMED_OUT", () => {
      expect(
        isValidTransition(StreamState.STREAMING, StreamState.TIMED_OUT),
      ).toBe(true);
    });

    it("allows COMPLETING → COMPLETED", () => {
      expect(
        isValidTransition(StreamState.COMPLETING, StreamState.COMPLETED),
      ).toBe(true);
    });

    it("allows COMPLETING → FAILED", () => {
      expect(
        isValidTransition(StreamState.COMPLETING, StreamState.FAILED),
      ).toBe(true);
    });

    it("disallows INITIAL → STREAMING (skip)", () => {
      expect(
        isValidTransition(StreamState.INITIAL, StreamState.STREAMING),
      ).toBe(false);
    });

    it("disallows COMPLETED → anything (terminal)", () => {
      expect(isValidTransition(StreamState.COMPLETED, StreamState.FAILED)).toBe(
        false,
      );
      expect(
        isValidTransition(StreamState.COMPLETED, StreamState.INITIAL),
      ).toBe(false);
    });

    it("disallows FAILED → anything (terminal)", () => {
      expect(isValidTransition(StreamState.FAILED, StreamState.COMPLETED)).toBe(
        false,
      );
    });

    it("disallows CANCELLED → anything (terminal)", () => {
      expect(
        isValidTransition(StreamState.CANCELLED, StreamState.STREAMING),
      ).toBe(false);
    });

    it("disallows TIMED_OUT → anything (terminal)", () => {
      expect(
        isValidTransition(StreamState.TIMED_OUT, StreamState.COMPLETED),
      ).toBe(false);
    });
  });

  describe("assertTransition", () => {
    it("returns the target state on valid transition", () => {
      expect(assertTransition(StreamState.INITIAL, StreamState.VALIDATED)).toBe(
        StreamState.VALIDATED,
      );
    });

    it("throws StreamTransitionError on invalid transition", () => {
      expect(() =>
        assertTransition(StreamState.INITIAL, StreamState.COMPLETED),
      ).toThrow(StreamTransitionError);
    });

    it("throws StreamTransitionError with correct from/to", () => {
      try {
        assertTransition(StreamState.COMPLETED, StreamState.FAILED);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(StreamTransitionError);
        const transErr = err as StreamTransitionError;
        expect(transErr.from).toBe(StreamState.COMPLETED);
        expect(transErr.to).toBe(StreamState.FAILED);
        expect(transErr.message).toContain("terminal state");
      }
    });
  });

  describe("happy path: full lifecycle", () => {
    it("INITIAL → VALIDATED → CONNECTING → STREAMING → COMPLETING → COMPLETED", () => {
      let state = StreamState.INITIAL;
      state = assertTransition(state, StreamState.VALIDATED);
      state = assertTransition(state, StreamState.CONNECTING);
      state = assertTransition(state, StreamState.STREAMING);
      state = assertTransition(state, StreamState.COMPLETING);
      state = assertTransition(state, StreamState.COMPLETED);
      expect(isTerminal(state)).toBe(true);
    });
  });

  describe("8 terminal paths", () => {
    it("INITIAL → FAILED", () => {
      const state = assertTransition(StreamState.INITIAL, StreamState.FAILED);
      expect(isTerminal(state)).toBe(true);
    });

    it("INITIAL → CANCELLED", () => {
      const state = assertTransition(
        StreamState.INITIAL,
        StreamState.CANCELLED,
      );
      expect(isTerminal(state)).toBe(true);
    });

    it("VALIDATED → FAILED", () => {
      const state = assertTransition(StreamState.VALIDATED, StreamState.FAILED);
      expect(isTerminal(state)).toBe(true);
    });

    it("CONNECTING → FAILED", () => {
      const state = assertTransition(
        StreamState.CONNECTING,
        StreamState.FAILED,
      );
      expect(isTerminal(state)).toBe(true);
    });

    it("CONNECTING → TIMED_OUT", () => {
      const state = assertTransition(
        StreamState.CONNECTING,
        StreamState.TIMED_OUT,
      );
      expect(isTerminal(state)).toBe(true);
    });

    it("STREAMING → FAILED", () => {
      const state = assertTransition(StreamState.STREAMING, StreamState.FAILED);
      expect(isTerminal(state)).toBe(true);
    });

    it("STREAMING → CANCELLED", () => {
      const state = assertTransition(
        StreamState.STREAMING,
        StreamState.CANCELLED,
      );
      expect(isTerminal(state)).toBe(true);
    });

    it("STREAMING → TIMED_OUT", () => {
      const state = assertTransition(
        StreamState.STREAMING,
        StreamState.TIMED_OUT,
      );
      expect(isTerminal(state)).toBe(true);
    });
  });

  describe("createStreamMetrics", () => {
    it("creates metrics with all zeroes", () => {
      const m = createStreamMetrics();
      expect(m.firstTokenAt).toBeNull();
      expect(m.lastChunkAt).toBeNull();
      expect(m.chunksEmitted).toBe(0);
      expect(m.bytesWritten).toBe(0);
      expect(m.hasEmittedModelOutput).toBe(false);
    });
  });
});
