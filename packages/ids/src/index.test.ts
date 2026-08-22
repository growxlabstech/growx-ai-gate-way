import { describe, expect, it } from "vitest";
import { createPublicId } from "./index.js";
describe("public IDs", () => {
  it("creates non-sequential namespaced IDs", () => {
    const a = createPublicId("req");
    expect(a).toMatch(/^req_[a-f0-9]{32}$/);
    expect(a).not.toBe(createPublicId("req"));
  });
});
