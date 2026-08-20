import { describe, expect, it } from "vitest";
import {
  InvalidStatusTransitionError,
  validateAliasStatusTransition,
  validateModelStatusTransition,
  validateRouteStatusTransition,
} from "../../src/domain/lifecycle.js";

describe("Lifecycle Transitions Unit Tests", () => {
  describe("Model Status Transitions", () => {
    it("allows valid forward transitions", () => {
      expect(() => validateModelStatusTransition("draft", "active")).not.toThrow();
      expect(() => validateModelStatusTransition("active", "deprecated")).not.toThrow();
      expect(() => validateModelStatusTransition("active", "disabled")).not.toThrow();
      expect(() => validateModelStatusTransition("deprecated", "retired")).not.toThrow();
      expect(() => validateModelStatusTransition("disabled", "active")).not.toThrow();
    });

    it("rejects illegal transitions from terminal retired state", () => {
      expect(() => validateModelStatusTransition("retired", "active")).toThrow(
        InvalidStatusTransitionError
      );
      expect(() => validateModelStatusTransition("retired", "draft")).toThrow(
        InvalidStatusTransitionError
      );
    });

    it("rejects illegal transition from active to draft", () => {
      expect(() => validateModelStatusTransition("active", "draft")).toThrow(
        InvalidStatusTransitionError
      );
    });
  });

  describe("Provider Route Transitions", () => {
    it("allows valid route transitions", () => {
      expect(() => validateRouteStatusTransition("active", "degraded")).not.toThrow();
      expect(() => validateRouteStatusTransition("degraded", "disabled")).not.toThrow();
      expect(() => validateRouteStatusTransition("disabled", "active")).not.toThrow();
      expect(() => validateRouteStatusTransition("active", "retired")).not.toThrow();
    });

    it("rejects illegal transitions from retired route", () => {
      expect(() => validateRouteStatusTransition("retired", "active")).toThrow(
        InvalidStatusTransitionError
      );
    });
  });

  describe("Alias Transitions", () => {
    it("allows valid alias transitions", () => {
      expect(() => validateAliasStatusTransition("active", "deprecated")).not.toThrow();
      expect(() => validateAliasStatusTransition("deprecated", "retired")).not.toThrow();
      expect(() => validateAliasStatusTransition("deprecated", "active")).not.toThrow();
    });

    it("rejects transitions from retired alias", () => {
      expect(() => validateAliasStatusTransition("retired", "active")).toThrow(
        InvalidStatusTransitionError
      );
    });
  });
});
