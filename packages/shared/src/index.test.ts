import { describe, expect, it } from "vitest";
import { ValidationError, createId } from "./index";

describe("shared foundation", () => {
  it("creates prefixed identifiers", () => expect(createId("req")).toMatch(/^req_[a-f0-9]{32}$/));
  it("assigns stable error metadata", () => expect(new ValidationError().statusCode).toBe(400));
});
