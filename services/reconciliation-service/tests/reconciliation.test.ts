import { describe, expect, it } from "vitest";
import { reconcileReferences } from "../src/index.js";
describe("reconciliation", () => {
  it("detects missing and duplicate references", () =>
    expect(reconcileReferences(["a", "b"], ["a", "a"])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ referenceId: "b", kind: "missing" }),
        expect.objectContaining({ referenceId: "a", kind: "duplicate" }),
      ]),
    ));
});
