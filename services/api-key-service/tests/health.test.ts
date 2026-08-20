import { describe, expect, it } from "vitest";
import { serviceName } from "../src/index";
describe("service skeleton", () => { it("has an identity", () => expect(serviceName).toBe("api-key-service")); });
