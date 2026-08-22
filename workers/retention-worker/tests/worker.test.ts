import { describe, expect, it } from "vitest";
import { workerName } from "../src/index";
describe("worker skeleton", () => {
  it("has an identity", () => expect(workerName).toBe("retention-worker"));
});
