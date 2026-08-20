import { describe, expect, it } from "vitest";
import { privilegedCapabilities } from "@growx/privileged-access";

describe("privilegedCapabilities", () => {
  it("defines canonical operational capabilities", () => {
    expect(privilegedCapabilities).toContain("ops.provider.manage");
    expect(privilegedCapabilities).toContain("ops.routing.manage");
    expect(privilegedCapabilities).toContain("ops.billing.adjust");
    expect(privilegedCapabilities).toContain("ops.security.respond");
  });
});
