import { describe, expect, it } from "vitest";
import { generateServiceToken, verifyServiceToken } from "./index";

describe("service-auth", () => {
  const secret = "test_service_secret_32_bytes_long_string!";

  it("generates and verifies valid inter-service authentication tokens", () => {
    const token = generateServiceToken("identity-service", secret);
    expect(token).toContain(".");

    const payload = verifyServiceToken(token, secret);
    expect(payload.serviceName).toBe("identity-service");
    expect(payload.issuedAt).toBeGreaterThan(0);
  });

  it("rejects tampered service tokens", () => {
    const token = generateServiceToken("identity-service", secret);
    const tampered = token.substring(0, 10) + "X" + token.substring(11);

    expect(() => verifyServiceToken(tampered, secret)).toThrow();
  });

  it("rejects tokens signed with wrong secret", () => {
    const token = generateServiceToken("identity-service", secret);
    expect(() => verifyServiceToken(token, "wrong_secret_key")).toThrow("Service token signature verification failed");
  });
});
